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
import type { Star } from '../../src/types/catalogue';

const stars = JSON.parse(
  readFileSync(new URL('../../public/data/stars.json', import.meta.url), 'utf8'),
) as readonly Star[];

const PANEL_WIDTH_PX = 280;
const MODAL_WIDTH_PX = 440;
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

async function setRadius(page: Page, radiusLy: number): Promise<void> {
  await page.getByLabel('Radius').fill(String(radiusLy));
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
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');
  const { width, height } = viewport;
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

// Stars to click: clear of the panel and the modal, with no other star near them on screen.
function isolatedStars(page: Page, keep?: (star: Star) => boolean): readonly StarOnScreen[] {
  const width = page.viewportSize()?.width ?? 0;
  const height = page.viewportSize()?.height ?? 0;
  const projected = projectedStars(page, keep);
  return projected.filter(
    (a) =>
      a.star.id !== 'hyg:0' &&
      a.x > PANEL_WIDTH_PX &&
      a.x < width - MODAL_WIDTH_PX &&
      a.y > 40 &&
      a.y < height - 40 &&
      projected.every((b) => b === a || Math.hypot(a.x - b.x, a.y - b.y) > 30),
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
    const on = await canvasShot(page);
    await page.getByLabel(label).uncheck();
    const off = await canvasShot(page);
    await expectChanged(page, off, on);
    await page.getByLabel(label).check();
    await expectSame(page, await canvasShot(page), on);
  });
}

test('double-click flies to a star, H returns to Sol', async ({ page }) => {
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
  const drag = async (button: 'left' | 'right') => {
    await page.mouse.move(800, 400);
    await page.mouse.down({ button });
    await page.mouse.move(860, 440, { steps: 5 });
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
  await page.mouse.move(x + 25, y - 25);
  await expect(tooltip).toHaveCount(0);
});

test('click selects with a pulsing ring and the modal; shift-click adds; Esc and empty space clear', async ({
  page,
}) => {
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
  await page.mouse.click(first.x + 25, first.y - 25);
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
  await page.getByLabel('Has planets').check();
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
  await page.mouse.click(x + 25, y - 25);
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('search: a hit outside the filters widens them so the star shows', async ({ page }) => {
  await openMap(page);
  const far = stars.find((star) => star.distLy > 60 && star.names.hd && star.spectral.cls === 'K');
  if (!far?.names.hd) throw new Error('No distant K star');
  await page.getByLabel('K', { exact: true }).uncheck();

  await page.keyboard.press('/');
  await page.keyboard.type(far.names.hd);
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog', { name: far.displayName })).toBeVisible();
  await expect(page.getByLabel('K', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Radius')).toHaveValue(String(Math.ceil(far.distLy)));
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
