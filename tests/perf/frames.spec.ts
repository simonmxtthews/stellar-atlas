import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { StarSystem } from '../../src/types/catalogue';

const TARGET_FPS = 60;
const ROUTE_COUNT = 50;
const STOPS_PER_ROUTE = 6;
const SAMPLE_MS = 5000;

const systems = JSON.parse(
  readFileSync(new URL('../../public/data/systems.json', import.meta.url), 'utf8'),
) as readonly StarSystem[];

function worldWithRoutes(): string {
  const routes = Array.from({ length: ROUTE_COUNT }, (_, route) => ({
    id: `route:${route}`,
    name: `Route ${route}`,
    waypoints: Array.from(
      { length: STOPS_PER_ROUTE },
      (_, stop) => systems[(route * STOPS_PER_ROUTE + stop) * 11]?.id,
    ),
    kind: 'trade',
    color: '#38bdf8',
    dashed: route % 2 === 0,
    width: 2,
  }));
  return JSON.stringify({
    schemaVersion: 1,
    name: 'Benchmark',
    drive: { type: 'jump', maxJumpLy: 10, daysPerJump: 7 },
    tags: [],
    starMeta: {},
    routes,
    regions: [],
  });
}

async function renderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
}

async function sampleFps(page: Page, durationMs: number): Promise<number> {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        const start = performance.now();
        let frames = 0;
        const tick = (now: number) => {
          frames++;
          if (now - start < duration) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (now - start));
        };
        requestAnimationFrame(tick);
      }),
    durationMs,
  );
}

test('every star within 100 ly and 50 routes hold the frame rate', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveAttribute('data-engine', /three\.js/);
  const gpu = await renderer(page);
  test.skip(/swiftshader|llvmpipe|software/i.test(gpu), `No GPU here: ${gpu}`);

  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.getByLabel('World file').setInputFiles({
    name: 'benchmark.json',
    mimeType: 'application/json',
    buffer: Buffer.from(worldWithRoutes()),
  });
  await page.getByRole('button', { name: 'Replace this world' }).click();
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.getByLabel('Radius').fill('100');
  await expect(page.getByTestId('visible-count')).toContainText(/^4,\d{3} stars/);
  await page.getByRole('button', { name: 'Routes' }).click();
  await expect(page.getByRole('complementary', { name: 'Route panel' })).toContainText('Route 49');
  await page.getByRole('button', { name: 'Routes' }).click();
  await page.waitForTimeout(2000);

  const idleFps = await sampleFps(page, SAMPLE_MS);

  // Orbiting, the case that matters: every frame redraws from a new angle.
  const orbiting = sampleFps(page, SAMPLE_MS);
  await page.mouse.move(800, 450);
  await page.mouse.down();
  for (let i = 0; i < 200; i++) {
    await page.mouse.move(800 + 200 * Math.sin(i / 20), 450 + 100 * Math.cos(i / 20));
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  const orbitFps = await orbiting;

  // Dragging the year, which moves every star, label and route.
  await page.getByRole('button', { name: 'Probes' }).click();
  const yearSlider = page.getByLabel('Map year');
  const dragging = sampleFps(page, SAMPLE_MS);
  const started = Date.now();
  for (let i = 1; Date.now() - started < SAMPLE_MS; i++) {
    await yearSlider.fill(String((i * 500) % 100_000));
  }
  const yearFps = await dragging;

  const report =
    `${gpu}: idle ${idleFps.toFixed(1)} fps, orbiting ${orbitFps.toFixed(1)} fps, ` +
    `dragging the year ${yearFps.toFixed(1)} fps`;
  console.log(report);
  testInfo.annotations.push({ type: 'performance', description: report });
  expect(idleFps).toBeGreaterThanOrEqual(TARGET_FPS);
  expect(orbitFps).toBeGreaterThanOrEqual(TARGET_FPS);
  expect(yearFps).toBeGreaterThanOrEqual(TARGET_FPS);
});
