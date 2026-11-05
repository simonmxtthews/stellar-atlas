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

// A star to double-click from the home camera, with its screen position: inside the default
// radius, clear of the panel and with no other star near it on screen.
function isolatedStar(width: number, height: number): { star: Star; x: number; y: number } {
  const camera = new PerspectiveCamera(CAMERA_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(...HOME_POSITION);
  camera.lookAt(...HOME_TARGET);
  camera.updateMatrixWorld();
  const projected = stars
    .filter((star) => star.distLy <= 50)
    .map((star) => {
      const ndc = new Vector3(...galacticToScene(star.pos)).project(camera);
      return { star, x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
    });
  const pick = projected.find(
    (a) =>
      a.star.id !== 'hyg:0' &&
      a.x > PANEL_WIDTH_PX &&
      a.x < width - 40 &&
      a.y > 40 &&
      a.y < height - 40 &&
      projected.every((b) => b === a || Math.hypot(a.x - b.x, a.y - b.y) > 30),
  );
  if (!pick) throw new Error('No isolated star on screen');
  return pick;
}

test('loads the map without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await openMap(page);

  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
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
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');
  const orbitTarget = page.getByTestId('orbit-target');
  await expect(orbitTarget).toHaveText('Orbit target: Sol');
  const home = await canvasShot(page);

  const { star, x, y } = isolatedStar(viewport.width, viewport.height);
  await page.mouse.dblclick(x, y);
  await expect(orbitTarget).toHaveText(`Orbit target: ${star.displayName}`);
  await page.waitForTimeout(SETTLE_MS * 2);
  await expectChanged(page, await canvasShot(page), home);

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
