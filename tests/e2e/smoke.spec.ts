import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_NEAR,
  HOME_POSITION,
  HOME_TARGET,
} from '../../src/lib/camera';
import { galacticToScene } from '../../src/lib/coords';
import { movedPosition } from '../../src/lib/mapTime';
import { STAR_EPOCH_YEAR } from '../../src/lib/probes';
import type { CatalogueMeta, Star, StarSystem } from '../../src/types/catalogue';

const stars = JSON.parse(
  readFileSync(new URL('../../public/data/stars.json', import.meta.url), 'utf8'),
) as readonly Star[];

const systems = JSON.parse(
  readFileSync(new URL('../../public/data/systems.json', import.meta.url), 'utf8'),
) as readonly StarSystem[];

const meta = JSON.parse(
  readFileSync(new URL('../../public/data/meta.json', import.meta.url), 'utf8'),
) as CatalogueMeta;

const PANEL_WIDTH_PX = 256;
const MODAL_WIDTH_PX = 430;
const PHONE_WIDTH_PX = 768; // below this, the controls and modal become sheets
const MAP_TOP_PX = 340; // clear of the toolbar, its banners and a short list of search results
const PHONE_SHEET_PX = 170;
const MIN_STAR_GAP_PX = 20;
const EMPTY_OFFSET_PX = 16; // a clear spot next to an isolated star
const MOUSE_PICK_RADIUS_PX = 14;
const SETTLE_MS = 1500;
const CHANGED_FRACTION = 0.0002;

function within(radiusLy: number): number {
  return stars.filter((star) => star.distLy <= radiusLy || star.id === 'hyg:0').length;
}

async function openMap(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('visible-count')).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-engine', /three\.js/);
  await page.waitForTimeout(SETTLE_MS);
}

async function visibleStars(page: Page): Promise<number> {
  const text = (await page.getByTestId('visible-count').textContent()) ?? '';
  return Number(/^([\d,]+) stars/.exec(text)?.[1]?.replaceAll(',', ''));
}

function viewportOf(page: Page): { readonly width: number; readonly height: number } {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');
  return viewport;
}

function isPhone(page: Page): boolean {
  return viewportOf(page).width < PHONE_WIDTH_PX;
}

// Phones start with the map controls collapsed, as they would otherwise cover the map.
async function showControls(page: Page): Promise<void> {
  const show = page
    .getByRole('complementary', { name: 'Map controls' })
    .getByRole('button', { name: 'Show', exact: true });
  if (await show.isVisible()) await show.click();
}

async function hideControlsOnPhone(page: Page): Promise<void> {
  if (!isPhone(page)) return;
  await page
    .getByRole('complementary', { name: 'Map controls' })
    .getByRole('button', { name: 'Hide', exact: true })
    .click();
}

async function setRadius(page: Page, radiusLy: number): Promise<void> {
  await showControls(page);
  await page.getByLabel('Radius').fill(String(radiusLy));
  await hideControlsOnPhone(page);
}

async function canvasShot(page: Page): Promise<Buffer> {
  await page.waitForTimeout(300);
  return page.locator('canvas').screenshot();
}

// Fraction of pixels that differ between two screenshots, decoded in the browser.
async function pixelDiff(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const decode = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No 2D context');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const [x, y] = await Promise.all([decode(first), decode(second)]);
      let differing = 0;
      for (let i = 0; i < x.length; i += 4) {
        const delta =
          Math.abs((x[i] ?? 0) - (y[i] ?? 0)) +
          Math.abs((x[i + 1] ?? 0) - (y[i + 1] ?? 0)) +
          Math.abs((x[i + 2] ?? 0) - (y[i + 2] ?? 0));
        if (delta > 24) differing++;
      }
      return differing / (x.length / 4);
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}

async function expectChanged(page: Page, a: Buffer, b: Buffer): Promise<void> {
  expect(await pixelDiff(page, a, b)).toBeGreaterThan(CHANGED_FRACTION);
}

async function expectSame(page: Page, a: Buffer, b: Buffer): Promise<void> {
  expect(await pixelDiff(page, a, b)).toBeLessThan(CHANGED_FRACTION);
}

interface StarOnScreen {
  readonly star: Star;
  readonly x: number;
  readonly y: number;
}

// Where the home camera draws each star that passes the filter, inside the default radius.
function projectedStars(
  page: Page,
  keep: (star: Star) => boolean = () => true,
  radiusLy = 50,
): readonly StarOnScreen[] {
  const { width, height } = viewportOf(page);
  const camera = new PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(...HOME_POSITION);
  camera.lookAt(...HOME_TARGET);
  camera.updateMatrixWorld();
  return stars
    .filter((star) => star.distLy <= radiusLy && keep(star))
    .map((star) => {
      const ndc = new Vector3(...galacticToScene(star.pos)).project(camera);
      return { star, x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
    });
}

// Stars to click: clear of the panels and the modal, with no other star near them or their empty
// spot on screen. On a phone the modal fills the screen, so nothing is clear of it.
function isolatedStars(page: Page, keep?: (star: Star) => boolean): readonly StarOnScreen[] {
  const { width, height } = viewportOf(page);
  const phone = isPhone(page);
  const left = phone ? 16 + EMPTY_OFFSET_PX : PANEL_WIDTH_PX + EMPTY_OFFSET_PX;
  const right = phone ? width - 16 : width - MODAL_WIDTH_PX;
  const bottom = height - (phone ? PHONE_SHEET_PX : 40);
  const projected = projectedStars(page, keep);
  return projected.filter(
    (a) =>
      a.star.id !== 'hyg:0' &&
      a.x > left &&
      a.x < right &&
      a.y > MAP_TOP_PX &&
      a.y < bottom &&
      projected.every(
        (b) =>
          b === a ||
          (Math.hypot(a.x - b.x, a.y - b.y) > MIN_STAR_GAP_PX &&
            Math.hypot(a.x - EMPTY_OFFSET_PX - b.x, a.y - EMPTY_OFFSET_PX - b.y) >
              MOUSE_PICK_RADIUS_PX),
      ),
  );
}

function isolatedStar(page: Page, keep?: (star: Star) => boolean): StarOnScreen {
  const pick = isolatedStars(page, keep)[0];
  if (!pick) throw new Error('No isolated star on screen');
  return pick;
}

async function shiftClick(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  await page.keyboard.up('Shift');
}

test('loads the map without errors or external requests', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('request', (request) => {
    const { protocol, hostname } = new URL(request.url());
    if (protocol.startsWith('http') && hostname !== 'localhost') external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await openMap(page);

  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('renders stars, and the radius slider and class filters change what is shown', async ({
  page,
}) => {
  await openMap(page);
  expect(await visibleStars(page)).toBe(within(50));
  const before = await canvasShot(page);

  await setRadius(page, 100);
  expect(await visibleStars(page)).toBe(within(100));
  await setRadius(page, 5);
  expect(await visibleStars(page)).toBe(within(5));
  await expectChanged(page, await canvasShot(page), before);
  await setRadius(page, 50);

  await showControls(page);
  const mDwarfs = stars.filter((star) => star.distLy <= 50 && star.spectral.cls === 'M').length;
  await page.getByLabel('M', { exact: true }).uncheck();
  expect(await visibleStars(page)).toBe(within(50) - mDwarfs);
  await expectChanged(page, await canvasShot(page), before);
  await page.getByLabel('M', { exact: true }).check();
  expect(await visibleStars(page)).toBe(within(50));
});

for (const label of ['Galactic grid', 'Range rings (5 ly)', 'Drop lines']) {
  test(`${label} toggles`, async ({ page }) => {
    await openMap(page);
    await showControls(page);
    const on = await canvasShot(page);
    await page.getByLabel(label).uncheck();
    const off = await canvasShot(page);
    await expectChanged(page, off, on);
    await page.getByLabel(label).check();
    await expectSame(page, await canvasShot(page), on);
  });
}

test('double-click flies to a star, H returns to Sol', async ({ page }) => {
  test.skip(isPhone(page), 'The first tap opens a full-screen sheet; phones fly there by search.');
  await openMap(page);
  const orbitTarget = page.getByTestId('orbit-target');
  await expect(orbitTarget).toHaveText('Orbit target: Sol');
  const home = await canvasShot(page);

  const { star, x, y } = isolatedStar(page);
  await page.mouse.dblclick(x, y);
  await expect(orbitTarget).toHaveText(`Orbit target: ${star.displayName}`);
  await page.waitForTimeout(SETTLE_MS * 2);
  await expectChanged(page, await canvasShot(page), home);

  // The clicks of a double-click also select; clear that so only the camera differs from home.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('h');
  await expect(orbitTarget).toHaveText('Orbit target: Sol');
  await page.waitForTimeout(SETTLE_MS * 3);
  await expectSame(page, await canvasShot(page), home);
});

test('orbit, pan and zoom move the view', async ({ page }) => {
  await openMap(page);
  const orbitTarget = page.getByTestId('orbit-target');
  const { width, height } = viewportOf(page);
  const [dragX, dragY] = [Math.round(width * 0.625), Math.round(height * 0.55)];
  const drag = async (button: 'left' | 'right') => {
    await page.mouse.move(dragX, dragY);
    await page.mouse.down({ button });
    await page.mouse.move(dragX + 60, dragY + 40, { steps: 5 });
    await page.mouse.up({ button });
    await page.waitForTimeout(SETTLE_MS);
  };

  let previous = await canvasShot(page);
  await drag('left');
  let current = await canvasShot(page);
  await expectChanged(page, current, previous);
  await expect(orbitTarget).toHaveText('Orbit target: Sol');

  previous = current;
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(SETTLE_MS);
  current = await canvasShot(page);
  await expectChanged(page, current, previous);
  await expect(orbitTarget).toHaveText('Orbit target: Sol');

  previous = current;
  await drag('right');
  await expectChanged(page, await canvasShot(page), previous);
  await expect(orbitTarget).toHaveText('Orbit target: free');
});

test('hovering a star shows its tooltip', async ({ page }) => {
  await openMap(page);
  const { star, x, y } = isolatedStar(page);
  const tooltip = page.getByTestId('star-tooltip');

  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(x, y);
  await expect(tooltip).toContainText(star.displayName);
  await expect(tooltip).toContainText(`${star.distLy.toFixed(2)} ly from Sol`);
  await page.mouse.move(x - EMPTY_OFFSET_PX, y - EMPTY_OFFSET_PX);
  await expect(tooltip).toHaveCount(0);
});

test('click selects with a pulsing ring and the modal; shift-click adds; Esc and empty space clear', async ({
  page,
}) => {
  test.skip(isPhone(page), 'The modal fills a phone screen; the touch test covers tap to select.');
  await openMap(page);
  const [first, second] = isolatedStars(page);
  if (!first || !second) throw new Error('Not enough isolated stars');
  const dialog = page.getByRole('dialog');
  const count = page.getByTestId('selection-count');
  const aroundFirst = {
    clip: { x: first.x - 30, y: first.y - 30, width: 60, height: 60 },
  };
  const before = await page.screenshot(aroundFirst);

  await page.mouse.click(first.x, first.y);
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(first.star.displayName);
  await expect(count).toHaveText('1 system selected');
  await page.mouse.move(PANEL_WIDTH_PX + 10, 8); // no tooltip over the ring
  const ringed = await page.screenshot(aroundFirst);
  await expectChanged(page, ringed, before);
  await expect
    .poll(async () => pixelDiff(page, await page.screenshot(aroundFirst), ringed), {
      message: 'the ring pulses',
    })
    .toBeGreaterThan(CHANGED_FRACTION);

  await shiftClick(page, second.x, second.y);
  await expect(count).toHaveText('2 systems selected');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(second.star.displayName);

  await shiftClick(page, second.x, second.y);
  await expect(count).toHaveText('1 system selected');
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(count).toHaveText('1 system selected');
  await page.keyboard.press('Escape');
  await expect(count).toHaveCount(0);

  // The map stays clickable under an open modal, and empty space clears.
  await page.mouse.click(first.x, first.y);
  await page.mouse.click(second.x, second.y);
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(second.star.displayName);
  await page.mouse.click(first.x - EMPTY_OFFSET_PX, first.y - EMPTY_OFFSET_PX);
  await expect(dialog).toHaveCount(0);
  await expect(count).toHaveCount(0);
  await expectSame(page, await page.screenshot(aroundFirst), before);
});

test('dragging off a star orbits without selecting', async ({ page }) => {
  await openMap(page);
  const { x, y } = isolatedStar(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 20, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('selection-count')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the modal lists a host star: facts, planets, HZ strip and neighbours', async ({ page }) => {
  await openMap(page);
  await showControls(page);
  await page.getByLabel('Has planets').check();
  await hideControlsOnPhone(page);
  const hosts = new Set(stars.filter((s) => s.planetIds.length > 0).map((s) => s.systemId));
  const { star, x, y } = isolatedStar(
    page,
    (candidate) => hosts.has(candidate.systemId) && candidate.planetIds.length > 0,
  );

  await page.mouse.click(x, y);
  const dialog = page.getByRole('dialog', { name: star.displayName });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Star facts' })).toContainText(
    `${star.distLy.toFixed(2)} ly`,
  );
  const planets = dialog.getByRole('region', { name: 'Planets' });
  await expect(planets.getByRole('row')).toHaveCount(star.planetIds.length + 1);
  await expect(planets.getByTestId('hz-strip')).toBeVisible();
  await expect(planets.getByRole('link')).toHaveAttribute(
    'href',
    /^https:\/\/exoplanetarchive\.ipac\.caltech\.edu\/overview\//,
  );

  const neighbours = dialog.getByRole('region', { name: 'Nearest neighbours' }).getByRole('button');
  await expect(neighbours).toHaveCount(8);
  await neighbours.first().click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).not.toHaveText(
    star.displayName,
  );
});

test('companions get a tab each, and Proxima Centauri shows its planets', async ({ page }) => {
  await openMap(page);
  await setRadius(page, 5);
  const proxima = stars.find((star) => star.names.proper === 'Proxima Centauri');
  if (!proxima) throw new Error('No Proxima');
  const [spot] = projectedStars(page, (star) => star.id === proxima.id);
  if (!spot) throw new Error('Proxima is off-screen');

  await page.mouse.click(spot.x, spot.y);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab')).toHaveCount(3);
  await dialog.getByRole('tab', { name: /^Proxima Centauri/ }).click();
  const planets = dialog.getByRole('region', { name: 'Planets' });
  await expect(planets.getByRole('row')).toHaveCount(proxima.planetIds.length + 1);
  await dialog.getByRole('tab').first().click();
  await expect(planets.getByText('No confirmed exoplanets')).toBeVisible();
});

test('labels stay within the cap and fall with the radius', async ({ page }) => {
  await openMap(page);
  const labels = page.getByTestId('label-count');
  const count = async () => Number.parseInt((await labels.textContent()) ?? '', 10);
  await expect.poll(count).toBeGreaterThan(50);
  expect(await count()).toBeLessThanOrEqual(150);
  await setRadius(page, 100);
  expect(await count()).toBeLessThanOrEqual(150);
  await setRadius(page, 5);
  await expect.poll(count).toBeLessThanOrEqual(5);
  await expect.poll(count).toBeGreaterThan(0);
});

test('search: "tau ceti" flies to the star and its modal lists the planets', async ({ page }) => {
  await openMap(page);
  const tauCeti = stars.find((star) => star.displayName === 'Tau Ceti');
  if (!tauCeti) throw new Error('No Tau Ceti');
  const home = await canvasShot(page);
  const search = page.getByRole('combobox', { name: 'Search stars' });

  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  // H and Esc are typing here, not map shortcuts.
  await page.keyboard.type('h');
  await expect(page.getByTestId('orbit-target')).toHaveText('Orbit target: Sol');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('tau ceti');
  await expect(page.getByRole('option').first()).toContainText('Tau Ceti');
  await expect(page.getByRole('option').first()).toContainText(`${tauCeti.distLy.toFixed(2)} ly`);
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Tau Ceti' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Planets' }).getByRole('row')).toHaveCount(
    tauCeti.planetIds.length + 1,
  );
  await expect(page.getByTestId('selection-count')).toHaveText('1 system selected');
  await expect(page.getByTestId('orbit-target')).toHaveText('Orbit target: Tau Ceti');
  await page.waitForTimeout(SETTLE_MS * 2);
  await expectChanged(page, await canvasShot(page), home);

  // The keyboard is back with the map.
  await expect(search).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('search: aliases agree, and arrows pick a result', async ({ page }) => {
  await openMap(page);
  const search = page.getByRole('combobox', { name: 'Search stars' });
  const first = page.getByRole('option').first();
  for (const query of ['α Cen', 'alpha cen', 'alp cen']) {
    await search.fill(query);
    await expect(first).toContainText('Rigil Kentaurus');
  }
  for (const query of ['GJ 699', 'Gliese 699', 'gl699']) {
    await search.fill(query);
    await expect(first).toContainText("Barnard's Star");
  }

  await search.fill('alpha cen');
  const secondName = await page.getByRole('option').nth(1).locator('span').first().textContent();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText(
    secondName ?? '',
  );
});

test('search: Esc leaves an open modal, and clicking the map closes the results', async ({
  page,
}) => {
  test.skip(isPhone(page), 'The modal fills a phone screen, leaving no map or search box to use.');
  await openMap(page);
  const { star, x, y } = isolatedStar(page);
  await page.mouse.click(x, y);
  const dialog = page.getByRole('dialog', { name: star.displayName });
  await expect(dialog).toBeVisible();

  await page.keyboard.press('/');
  await page.keyboard.type('sirius');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await page.keyboard.press('/');
  await page.keyboard.type('sirius');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.mouse.click(x - EMPTY_OFFSET_PX, y - EMPTY_OFFSET_PX);
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('search: a hit outside the filters widens them so the star shows', async ({ page }) => {
  await openMap(page);
  const far = stars.find((star) => star.distLy > 60 && star.names.hd && star.spectral.cls === 'K');
  if (!far?.names.hd) throw new Error('No distant K star');
  await showControls(page);
  await page.getByLabel('K', { exact: true }).uncheck();

  await page.keyboard.press('/');
  await page.keyboard.type(far.names.hd);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog', { name: far.displayName })).toBeVisible();
  await expect(page.getByLabel('K', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Radius')).toHaveValue(String(Math.ceil(far.distLy)));
});

// Clear of the toolbar, whose hover state shows in screenshots, and of any star's tooltip.
async function restPointer(page: Page): Promise<void> {
  const { width, height } = viewportOf(page);
  await page.mouse.move(width - 10, height - 5);
}

function threeStops(page: Page): readonly [StarOnScreen, StarOnScreen, StarOnScreen] {
  const [first, second, third] = isolatedStars(page);
  if (!first || !second || !third) throw new Error('Not enough isolated stars');
  return [first, second, third];
}

function lightYears(a: Star, b: Star): number {
  const [x, y, z] = a.pos;
  return Math.hypot(x - b.pos[0], y - b.pos[1], z - b.pos[2]);
}

async function buildRoute(page: Page): Promise<readonly StarOnScreen[]> {
  const stops = threeStops(page);
  await page.keyboard.press('r');
  for (const { x, y } of stops) await page.mouse.click(x, y);
  await expect(page.getByTestId('route-draft')).toContainText(' → ');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Route panel' })).toBeVisible();
  return stops;
}

test('route mode: clicks add waypoints, Backspace and Esc work, and clicks do not select', async ({
  page,
}) => {
  await openMap(page);
  const [first, second] = threeStops(page);
  const draft = page.getByTestId('route-draft');

  await page.keyboard.press('r');
  await page.mouse.click(first.x, first.y);
  await page.mouse.click(second.x, second.y);
  await expect(draft).toContainText(' → ');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('selection-count')).toHaveCount(0);

  await page.keyboard.press('Backspace');
  await expect(draft).not.toContainText(' → ');

  await page.keyboard.press('Escape');
  await expect(draft).toHaveCount(0);
  await page.keyboard.press('r');
  await expect(draft).toContainText('Click systems');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Routes' }).click();
  await expect(page.getByText('No routes yet')).toBeVisible();
});

test('a 3-stop route draws, shows its distances, and persists through a reload', async ({
  page,
}) => {
  await openMap(page);
  const before = await canvasShot(page);
  const [first, second, third] = await buildRoute(page);
  if (!first || !second || !third) throw new Error('Not enough stops');
  await page.getByRole('button', { name: 'Routes' }).click(); // close, to compare just the map
  await restPointer(page);
  await expectChanged(page, await canvasShot(page), before);
  await page.getByRole('button', { name: 'Routes' }).click();

  const legA = lightYears(first.star, second.star);
  const legB = lightYears(second.star, third.star);
  // System positions are the primaries', which these isolated stars are close to.
  const total = page.getByTestId('route-total');
  await expect(total).toHaveText(/ ly$/);
  expect(Number.parseFloat((await total.textContent()) ?? '')).toBeCloseTo(legA + legB, 0);
  await expect(page.getByTestId('leg-distance')).toHaveCount(2);

  await page.getByLabel('Name', { exact: true }).fill('The Long Haul');
  await page.getByLabel('Kind').selectOption('military');
  await page.getByLabel('Dashed').check();

  // Without waiting out the autosave debounce: leaving the page flushes it.
  await page.reload();
  await expect(page.getByTestId('visible-count')).toBeVisible();
  await page.getByRole('button', { name: 'Routes' }).click();
  await page.getByRole('button', { name: /The Long Haul/ }).click();
  await expect(page.getByLabel('Kind')).toHaveValue('military');
  await expect(page.getByLabel('Dashed')).toBeChecked();
  await expect(page.getByTestId('leg-distance')).toHaveCount(2);
});

test('a hidden route leaves the map, and a deleted one can be undone', async ({ page }) => {
  await openMap(page);
  // Below the toolbar, whose Undo button lights up once there is an edit.
  const { width, height } = viewportOf(page);
  const map = { clip: { x: 0, y: 160, width, height: height - 160 } };
  await restPointer(page);
  const before = await page.screenshot(map);
  await buildRoute(page);
  const panelButton = page.getByRole('button', { name: 'Routes' });
  await panelButton.click();
  await restPointer(page);
  await page.waitForTimeout(300);
  await expectChanged(page, await page.screenshot(map), before);
  await panelButton.click();
  await page.getByRole('checkbox', { name: /^Show / }).uncheck();
  await panelButton.click();
  await restPointer(page);
  await page.waitForTimeout(300);
  await expectSame(page, await page.screenshot(map), before);
  await panelButton.click();
  await page.getByRole('checkbox', { name: /^Show / }).check();

  await page.getByRole('button', { name: 'Delete route' }).click();
  await expect(page.getByText('No routes yet')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('route-total')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.getByText('No routes yet')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('route-total')).toBeVisible();
});

test('the ruler measures two stars and saves nothing', async ({ page }) => {
  await openMap(page);
  const [first, second] = threeStops(page);
  const before = await canvasShot(page);
  const readout = page.getByTestId('ruler-readout');

  await page.keyboard.press('m');
  await page.mouse.click(first.x, first.y);
  await expect(readout).toContainText('pick a second star');
  await page.mouse.click(second.x, second.y);
  await expect(readout).toContainText(
    `${first.star.displayName} → ${second.star.displayName}: ${lightYears(first.star, second.star).toFixed(2)} ly · `,
  );
  await expect(readout).toContainText(/jump/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await restPointer(page);
  await expectChanged(page, await canvasShot(page), before);

  await page.keyboard.press('Escape');
  await expect(readout).toHaveCount(0);
  await page.waitForTimeout(SETTLE_MS);
  await expectSame(page, await canvasShot(page), before);
  await page.getByRole('button', { name: 'Routes' }).click();
  await expect(page.getByText('No routes yet')).toBeVisible();
});

test('custom names, notes and tags: halos, typing stays typing, search and reload find them', async ({
  page,
}) => {
  await openMap(page);
  const { star, x, y } = isolatedStar(page);
  const around = { clip: { x: x - 30, y: y - 30, width: 60, height: 60 } };
  const before = await page.screenshot(around);

  await page.mouse.click(x, y);
  const dialog = page.getByRole('dialog', { name: star.displayName });
  const orbit = page.getByTestId('orbit-target');

  // H, R, M and / are letters here, not shortcuts; backspacing doesn't touch a route.
  await dialog.getByLabel('Custom name').fill('');
  await dialog.getByLabel('Custom name').pressSequentially('Harm/ony');
  await expect(orbit).toHaveText('Orbit target: Sol');
  await expect(dialog.getByTestId('custom-name')).toHaveText('Harm/ony');
  await dialog.getByLabel('Notes').fill('Capital of the rim worlds');

  await dialog.getByLabel('New tag').fill('Colonised');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await dialog.getByLabel('New tag').fill('Hegemony');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog.getByRole('button', { name: 'Hegemony', pressed: true })).toBeVisible();

  // In a text field Esc stays with the field; from anywhere else it closes, then clears.
  await dialog.getByLabel('New tag').focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('New tag').blur();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Escape');
  await restPointer(page);
  await expectChanged(page, await page.screenshot(around), before);

  await showControls(page);
  await page.getByLabel('Tagged only').check();
  await expect(page.getByTestId('visible-count')).toContainText(/^2 stars/);
  await page.getByLabel('Tagged only').uncheck();

  await page.waitForTimeout(SETTLE_MS);
  await page.reload();
  await expect(page.getByTestId('visible-count')).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search stars' });
  await search.fill('harm');
  await expect(page.getByRole('option').first()).toContainText(`Harm/ony (${star.displayName})`);
  await search.fill('hegemony');
  await expect(page.getByRole('option').first()).toContainText('Harm/ony');
  await page.keyboard.press('Enter');
  const reopened = page.getByRole('dialog', { name: star.displayName });
  await expect(reopened.getByLabel('Notes')).toHaveValue('Capital of the rim worlds');
});

test('export then import round-trips identically', async ({ page }, testInfo) => {
  await openMap(page);
  await buildRoute(page);
  await page.getByRole('button', { name: 'Routes' }).click(); // it covers the stars
  const { x, y } = threeStops(page)[1];
  await page.mouse.click(x, y);
  await page.getByRole('dialog').getByLabel('Custom name').fill('Haven');
  await page.getByRole('dialog').getByLabel('New tag').fill('Core');
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'World', exact: true }).click();

  const exportWorld = async (): Promise<{ readonly text: string; readonly name: string }> => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export JSON' }).click(),
    ]);
    const path = testInfo.outputPath(`${Date.now()}.json`);
    await download.saveAs(path);
    return { text: readFileSync(path, 'utf8'), name: download.suggestedFilename() };
  };

  const original = await exportWorld();
  expect(original.name).toMatch(/^world-my-world-\d{4}-\d{2}-\d{2}\.json$/);
  const parsed = JSON.parse(original.text) as { routes: readonly unknown[]; tags: unknown[] };
  expect(parsed.routes).toHaveLength(1);
  expect(parsed.tags).toHaveLength(1);

  // Into a fresh world, so that everything has to come from the file.
  await page.getByRole('button', { name: 'New world' }).click();
  await page.getByLabel('World file').setInputFiles({
    name: 'world.json',
    mimeType: 'application/json',
    buffer: Buffer.from(original.text),
  });
  await page.getByRole('button', { name: 'Replace this world' }).click();
  await expect(page.getByLabel('World name')).toHaveValue('My world');
  expect((await exportWorld()).text).toBe(original.text);
});

test('import reports unknown IDs without failing, and rejects a broken file', async ({ page }) => {
  await openMap(page);
  await page.getByRole('button', { name: 'World', exact: true }).click();
  const file = page.getByLabel('World file');

  await file.setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion": 99}'),
  });
  await expect(page.getByRole('alert')).toContainText('schema version 99');

  const world = {
    schemaVersion: 1,
    name: 'Stale',
    drive: { type: 'jump', maxJumpLy: 10, daysPerJump: 7 },
    tags: [],
    starMeta: { 'hyg:not-a-star': { tagIds: [], notes: 'orphan' } },
    routes: [],
    regions: [],
  };
  await file.setInputFiles({
    name: 'stale.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(world)),
  });
  await expect(page.getByTestId('unknown-ids')).toContainText('hyg:not-a-star');
  await page.getByRole('button', { name: 'Replace this world' }).click();
  await expect(page.getByLabel('World name')).toHaveValue('Stale');
});

test('the drive model updates every travel time, and persists', async ({ page }) => {
  await openMap(page);
  await buildRoute(page);
  const time = page.getByTestId('route-time');
  await expect(time).toContainText('jump');

  await page.getByRole('button', { name: 'Drive' }).click();
  const calculator = page.getByTestId('calculator-result');
  await expect(calculator).toContainText('4.37 ly: at least 1 jump · 7.0 d');
  await page.getByLabel('Days per jump').fill('14');
  await expect(calculator).toContainText('1 jump · 14 d');

  await page.getByLabel('Drive model').selectOption('sublight');
  await page.getByLabel('Constant acceleration').check();
  await expect(calculator).toContainText('ship 3.58 yr · Earth 6.00 yr');

  await page.getByLabel('Drive model').selectOption('ftl-speed');
  await page.getByLabel('Speed (multiple of c)').fill('');
  await expect(page.getByLabel('Speed (multiple of c)')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Speed (multiple of c)').fill('100');
  await expect(calculator).toContainText('4.37 ly: 16 d');

  await page.getByRole('button', { name: 'Routes' }).click();
  await expect(time).not.toContainText('jump');
  await expect(page.getByTestId('leg-distance').first()).not.toContainText('jump');

  await page.reload();
  await expect(page.getByTestId('visible-count')).toBeVisible();
  await page.getByRole('button', { name: 'Drive' }).click();
  await expect(page.getByLabel('Speed (multiple of c)')).toHaveValue('100');
});

test('the jump network draws in component colours and follows the max jump', async ({ page }) => {
  await openMap(page);
  await page.getByRole('button', { name: 'Network' }).click();
  const off = await canvasShot(page);
  await page.getByLabel('Show jump network').check();
  await expectChanged(page, await canvasShot(page), off);
  const stats = page.getByTestId('network-stats');
  await expect(stats).toContainText('within 10 ly');
  const atTen = await stats.textContent();

  await page.getByRole('button', { name: 'Drive' }).click();
  await page.getByLabel(/Max jump/).fill('5');
  await page.getByRole('button', { name: 'Network' }).click();
  await expect(stats).toContainText('within 5 ly');
  expect(await stats.textContent()).not.toBe(atTen);
  await expect(
    page.getByRole('list', { name: 'Largest clusters' }).getByRole('listitem'),
  ).not.toHaveCount(1);
});

test('hubs rank in a worker, and an auto-route previews then saves', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await openMap(page);
  await page.getByRole('button', { name: 'Network' }).click();
  await page.getByRole('button', { name: 'Rank hubs' }).click();
  await expect(page.getByRole('list', { name: 'Hubs' }).getByRole('listitem')).toHaveCount(10);
  expect(workers.filter((url) => url.includes('hubs.worker'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Network' }).click();

  const [first, second] = threeStops(page);
  await page.keyboard.press('a');
  const plan = page.getByTestId('auto-route-plan');
  await page.mouse.click(first.x, first.y);
  await expect(plan).toContainText('pick an end system');
  await page.mouse.click(second.x, second.y);
  await expect(plan).toContainText(' → ');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const total = (await page.getByTestId('auto-route-total').textContent()) ?? '';
  const jumps = Number(/(\d+) jumps?/.exec(total)?.[1]);
  const stops = ((await plan.textContent()) ?? '').split(' → ').length;
  expect(jumps).toBe(stops - 1);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Route panel' })).toBeVisible();
  await expect(page.getByTestId('leg-distance')).toHaveCount(stops - 1);
  for (const leg of await page.getByTestId('leg-distance').all()) {
    await expect(leg).toContainText('1 jump');
  }
});

test('a reference star moves the distances, and a range sphere lists what is inside', async ({
  page,
}) => {
  await openMap(page);
  const pick = isolatedStar(page);
  const sirius = stars.find((star) => star.displayName === 'Sirius');
  if (!sirius) throw new Error('No Sirius');
  const siriusSystem = systems.find((system) => system.id === sirius.systemId);
  if (!siriusSystem) throw new Error('No Sirius system');

  await page.mouse.click(pick.x, pick.y);
  const modal = page.getByRole('dialog', { name: pick.star.displayName });
  await modal.getByRole('button', { name: 'Set as reference' }).click();
  await expect(page.getByTestId('reference-star')).toContainText(pick.star.displayName);

  const expected = stars.filter(
    (star) => star.id === 'hyg:0' || lightYears(star, pick.star) <= 50,
  ).length;
  expect(await visibleStars(page)).toBe(expected);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  await page.keyboard.type('sirius');
  await expect(page.getByRole('option').first()).toContainText(
    `${lightYears(sirius, pick.star).toFixed(2)} ly`,
  );
  await page.keyboard.press('Enter');
  const siriusModal = page.getByRole('dialog', { name: 'Sirius' });
  await expect(siriusModal.getByText(`Distance from ${pick.star.displayName}`)).toBeVisible();

  if (isPhone(page)) {
    // The sheet covers the map controls, so step out to reach them and come back.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Back to Sol' }).click();
    await page.keyboard.press('/');
    await page.keyboard.type('sirius');
    await page.keyboard.press('Enter');
  } else {
    await page.getByRole('button', { name: 'Back to Sol' }).click();
  }
  expect(await visibleStars(page)).toBeGreaterThan(0);
  await expect(siriusModal.getByText(`Distance from ${pick.star.displayName}`)).toHaveCount(0);

  await siriusModal.getByRole('button', { name: 'Show range sphere' }).click();
  await siriusModal.getByLabel('Range sphere radius').fill('5');
  const inside = systems.filter(
    (system) =>
      system.id !== siriusSystem.id &&
      Math.hypot(
        system.pos[0] - siriusSystem.pos[0],
        system.pos[1] - siriusSystem.pos[1],
        system.pos[2] - siriusSystem.pos[2],
      ) <= 5,
  );
  await expect(page.getByTestId('range-count')).toContainText(`${inside.length} system`);
  await expect(
    page.getByRole('list', { name: 'Systems in range' }).getByRole('listitem'),
  ).toHaveCount(inside.length);
});

test('probe trajectories, the year slider, the approach table and the pulsar map', async ({
  page,
}) => {
  await openMap(page);
  await page.getByRole('button', { name: 'Probes' }).click();
  const panel = page.getByRole('complementary', { name: 'Probes panel' });
  const off = await canvasShot(page);
  await panel.getByLabel('Show probe trajectories').check();
  const paths = await canvasShot(page);
  await expectChanged(page, paths, off);

  const voyager = page.getByTestId('probe-row').filter({ hasText: 'Voyager 1' });
  await expect(voyager).toContainText('0.000 ly');
  await panel.getByLabel('Map year').fill('100000');
  // 16.9 km/s for 100,000 years.
  await expect(voyager).toContainText('5.64');
  await expect(page.getByTestId('approach-note')).toContainText('catalogue velocity');

  // The star that really comes close, moving; not the one that lies ahead of the probe today.
  const nearest = panel.getByRole('region', { name: 'Voyager 1 closest approaches' });
  await expect(nearest).toContainText('GJ 445');
  await expect(nearest).not.toContainText("Barnard's Star");

  await panel.getByLabel('Approach distance').fill('10');
  const table = panel.getByRole('region', { name: 'Voyager 1 closest approaches' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();

  const withoutPulsars = await canvasShot(page);
  await panel.getByLabel('Show pulsar map').check();
  await expectChanged(page, await canvasShot(page), withoutPulsars);
});

test('regions: a halo and a legend, assigned from the modal or the selection, and saved', async ({
  page,
}) => {
  await openMap(page);
  const [first, second] = threeStops(page);
  const around = { clip: { x: first.x - 30, y: first.y - 30, width: 60, height: 60 } };
  await restPointer(page);
  const before = await page.screenshot(around);
  const legend = page.getByRole('list', { name: 'Region legend' });
  await expect(legend).toHaveCount(0);

  await page.getByRole('button', { name: 'World', exact: true }).click();
  const regions = page.getByRole('region', { name: 'Regions' });
  await regions.getByLabel('New region name').fill('Hegemony');
  await regions.getByRole('button', { name: 'Add' }).click();
  await expect(legend).toContainText('Hegemony');
  await page.getByRole('button', { name: 'World', exact: true }).click();

  await page.mouse.click(first.x, first.y);
  await page
    .getByRole('dialog')
    .getByRole('group', { name: 'Regions' })
    .getByRole('button', { name: 'Hegemony', pressed: false })
    .click();
  await expect(legend.getByRole('listitem')).toHaveText(/Hegemony\s*1/);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await restPointer(page);
  await page.waitForTimeout(300);
  await expectChanged(page, await page.screenshot(around), before);

  // Picked on the map, then added in one go from the panel.
  await page.mouse.click(second.x, second.y);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await regions.getByRole('button', { name: 'Add selected systems to Hegemony' }).click();
  await expect(legend.getByRole('listitem')).toHaveText(/Hegemony\s*2/);

  await page.reload();
  await expect(legend.getByRole('listitem')).toHaveText(/Hegemony\s*2/);

  await page.getByRole('button', { name: 'World', exact: true }).click();
  await regions.getByRole('button', { name: 'Delete Hegemony' }).click();
  await expect(legend).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(legend).toContainText('Hegemony');
});

test('the routes CSV has a row per leg', async ({ page }, testInfo) => {
  await openMap(page);
  const [first, second, third] = await buildRoute(page);
  if (!first || !second || !third) throw new Error('Not enough stops');
  await page.getByLabel('Name', { exact: true }).fill('Haul, the long');
  await page.getByRole('button', { name: 'World', exact: true }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export routes CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^routes-my-world-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = testInfo.outputPath('routes.csv');
  await download.saveAs(path);
  const lines = readFileSync(path, 'utf8')
    .replace(/^\uFEFF/, '')
    .split('\r\n');
  expect(lines).toHaveLength(4); // the header, two legs, and the final line ending
  expect(lines[0]).toBe('route,leg,from,to,ly,travel time');
  expect(lines[1]).toMatch(/^"Haul, the long",1,.*,\d+\.\d{2},.*(jump|no jump path)/);
  expect(lines[2]).toMatch(/^"Haul, the long",2,/);
});

test('the PNG snapshot is the map, on an opaque background', async ({ page }, testInfo) => {
  await openMap(page);
  await page.getByRole('button', { name: 'World', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Snapshot PNG' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^snapshot-my-world-\d{4}-\d{2}-\d{2}\.png$/);
  const path = testInfo.outputPath('snapshot.png');
  await download.saveAs(path);

  const { width, height } = viewportOf(page);
  const scale = await page.evaluate(() => window.devicePixelRatio);
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D context');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let opaque = 0;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 255) opaque++;
      if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 60) lit++;
    }
    return { width: image.width, height: image.height, total: data.length / 4, opaque, lit };
  }, readFileSync(path).toString('base64'));
  expect(pixels.width).toBe(Math.round(width * scale));
  expect(pixels.height).toBe(Math.round(height * scale));
  expect(pixels.opaque).toBe(pixels.total);
  expect(pixels.lit).toBeGreaterThan(500); // stars, grid and labels, not a blank frame
});

test('the About panel credits the data and gives its build date', async ({ page }) => {
  await openMap(page);
  await page.getByRole('button', { name: 'About' }).click();
  const panel = page.getByRole('complementary', { name: 'About panel' });
  await expect(panel.getByTestId('attribution')).toContainText('HYG Database');
  await expect(panel.getByTestId('attribution')).toContainText('NASA Exoplanet Archive');
  await expect(panel.getByTestId('build-date')).toHaveText(meta.buildDate.slice(0, 10));
  await expect(panel.getByRole('link', { name: 'HYG Database' })).toHaveAttribute(
    'href',
    'https://astronexus.com/hyg',
  );
  await expect(panel.getByRole('link', { name: /NASA Exoplanet Archive/ })).toHaveAttribute(
    'href',
    'https://exoplanetarchive.ipac.caltech.edu/',
  );
});

test('the year slider moves the map, while the figures and filters stay as of today', async ({
  page,
}) => {
  await openMap(page);
  const yearsAhead = 40_000;
  const banner = page.getByTestId('map-year');
  const count = await visibleStars(page);
  const today = await canvasShot(page);
  await expect(banner).toHaveCount(0);

  await page.getByRole('button', { name: 'Probes' }).click();
  await page.getByLabel('Map year').fill(String(yearsAhead));
  await page.getByRole('button', { name: 'Probes' }).click();
  const year = new Date().getFullYear() + yearsAhead;
  await expect(banner).toHaveText(`Showing AD ${year.toLocaleString('en')}`);
  await expect(page.getByTestId('orbit-target')).toHaveText('Orbit target: Sol');
  expect(await visibleStars(page)).toBe(count);
  await restPointer(page);
  await expectChanged(page, await canvasShot(page), today);

  // A star is clicked where it has moved to, and its figures are still today's.
  const { width, height } = viewportOf(page);
  const camera = new PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(...HOME_POSITION);
  camera.lookAt(...HOME_TARGET);
  camera.updateMatrixWorld();
  const everywhere = stars.map((star) => {
    const system = systems.find((candidate) => candidate.id === star.systemId);
    const years = year - STAR_EPOCH_YEAR;
    const ndc = new Vector3(
      ...galacticToScene(movedPosition(star.pos, system?.motion, years)),
    ).project(camera);
    return { star, x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
  });
  const visibleNow = everywhere.filter(({ star }) => star.distLy <= 50);
  const pick = visibleNow.find(
    (a) =>
      a.star.id !== 'hyg:0' &&
      systems.find((system) => system.id === a.star.systemId)?.motion?.radialKnown &&
      a.x > (isPhone(page) ? 32 : PANEL_WIDTH_PX) &&
      a.x < width - (isPhone(page) ? 16 : MODAL_WIDTH_PX) &&
      a.y > MAP_TOP_PX + 100 &&
      a.y < height - (isPhone(page) ? PHONE_SHEET_PX : 40) &&
      visibleNow.every((b) => b === a || Math.hypot(a.x - b.x, a.y - b.y) > MIN_STAR_GAP_PX),
  );
  if (!pick) throw new Error('No isolated moved star on screen');
  await page.mouse.click(pick.x, pick.y);
  const dialog = page.getByRole('dialog', { name: pick.star.displayName });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Star facts' })).toContainText(
    `${pick.star.distLy.toFixed(2)} ly`,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(banner).toHaveCount(0);
  await restPointer(page);
  await page.waitForTimeout(SETTLE_MS);
  await expectSame(page, await canvasShot(page), today);
});

test('a route and a selection keep to their moving stars, and the camera to its orbit star', async ({
  page,
}) => {
  await openMap(page);
  await buildRoute(page);
  const routes = page.getByRole('button', { name: 'Routes' });
  const legs = page.getByTestId('leg-distance');
  const todaysLegs = await legs.allTextContents();
  await routes.click();
  await page.keyboard.press('/');
  await page.keyboard.type('vega');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('orbit-target')).toHaveText('Orbit target: Vega');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS * 2);

  await page.getByRole('button', { name: 'Probes' }).click();
  await page.getByLabel('Map year').fill('60000');
  await page.getByRole('button', { name: 'Routes' }).click();
  await expect(page.getByTestId('orbit-target')).toHaveText('Orbit target: Vega');
  await expect(page.getByTestId('map-year')).toBeVisible();
  expect(await legs.allTextContents()).toEqual(todaysLegs);

  // No flight restarts as the year changes, and orbiting doesn't lose the star.
  await routes.click();
  const { width, height } = viewportOf(page);
  const [x, y] = [Math.round(width * 0.625), Math.round(height * 0.55)];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 30, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByTestId('orbit-target')).toHaveText('Orbit target: Vega');
});

test.describe('touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('tap selects into a full-screen sheet; long-press shows the tooltip instead', async ({
    page,
  }) => {
    await openMap(page);
    const projected = projectedStars(page);
    const target = projected.find(
      (a) =>
        a.star.id !== 'hyg:0' &&
        a.x > 40 &&
        a.x < 350 &&
        a.y > 150 &&
        a.y < 650 &&
        projected.every((b) => b === a || Math.hypot(a.x - b.x, a.y - b.y) > 12),
    );
    if (!target) throw new Error('No isolated star on screen');
    const touch = await page.context().newCDPSession(page);
    const point = { x: target.x, y: target.y };

    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(page.getByTestId('star-tooltip')).toContainText(target.star.displayName);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.touchscreen.tap(target.x, target.y);
    const dialog = page.getByRole('dialog', { name: target.star.displayName });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('star-tooltip')).toHaveCount(0);
    const box = await dialog.boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBe(844);
  });
});
