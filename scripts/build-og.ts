// Renders the social preview: public/og-image.png (1200×630) and public/og-video.mp4 (a seamless
// loop), from the real catalogue in public/data/. Needs Playwright's Chromium and ffmpeg on PATH.
//
//   npm run og            both
//   npm run og -- --image the still only

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { drawOgFrame, type OgFrame, type OgRoute, type OgStar } from './og/draw';

const root = resolve(import.meta.dirname, '..');
const W = 1200;
const H = 630;
const FPS = 30;
const LOOP_SECONDS = 16;

interface Star {
  readonly displayName: string;
  readonly pos: readonly [number, number, number];
  readonly distLy: number;
  readonly colorHex: string;
  readonly absMag: number;
}
interface Planet {
  readonly hostStarId: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T;

const stars = readJson<readonly Star[]>('public/data/stars.json');
const planets = readJson<readonly Planet[]>('public/data/planets.json');
const meta = readJson<{ radiusLy: number }>('public/data/meta.json');

const byName = (name: string): Star => {
  const s = stars.find((x) => x.displayName === name);
  if (!s) throw new Error(`No star named ${name}`);
  return s;
};
const dist = (a: Star, b: Star) => Math.hypot(...a.pos.map((v, i) => v - (b.pos[i] ?? 0)));

const route = (...names: string[]): OgRoute => {
  const s = names.map(byName);
  return {
    stops: s.map((x) => ({ name: x.displayName, p: x.pos })),
    legsLy: s.slice(1).map((x, i) => dist(s[i] as Star, x)),
  };
};

const ogStars: OgStar[] = stars
  .filter((s) => s.distLy > 0)
  .map((s) => ({ p: s.pos, color: s.colorHex, absMag: s.absMag }));
const routes = [
  route('Sol', 'Arcturus', 'Alphecca'),
  route('Sol', 'Fomalhaut', 'Ankaa'),
  route('Sol', 'Vega', 'Aljanah'),
];

const fmt = (n: number) => n.toLocaleString('en-GB');
const stats = [
  { value: fmt(stars.length - 1), label: 'Stars' },
  { value: fmt(planets.filter((p) => p.hostStarId !== 'hyg:0').length), label: 'Exoplanets' },
  { value: `${meta.radiusLy} ly`, label: 'Radius' },
];

const base: Omit<OgFrame, 'azimuth' | 'routeProgress' | 'routeOpacity'> = {
  stars: ogStars,
  routes,
  radiusLy: meta.radiusLy,
  elevation: 0.5,
  centre: [842, 322],
  scale: 2.75,
};
const STILL_AZIMUTH = 1.25;

const font = (weight: number) =>
  readFileSync(
    resolve(root, `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`),
  ).toString('base64');
const lockup = readFileSync(resolve(root, 'public/lockup.svg'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace('<svg ', '<svg class="lockup" ');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url(data:font/woff2;base64,${font(400)}) format('woff2')}
@font-face{font-family:Inter;font-weight:500;src:url(data:font/woff2;base64,${font(500)}) format('woff2')}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#0a0b0e;color:#ecebe6;
  font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
canvas{position:absolute;inset:0;width:100%;height:100%}
.glow{position:absolute;inset:0;background:radial-gradient(ellipse 620px 420px at 842px 322px,
  rgba(143,179,255,0.07),transparent 70%)}
.scrim{position:absolute;inset:0;background:linear-gradient(90deg,#0a0b0e 0%,#0a0b0e 34%,
  rgba(10,11,14,0.86) 46%,rgba(10,11,14,0) 62%)}
.copy{position:absolute;left:72px;top:68px;bottom:64px;width:520px;display:flex;
  flex-direction:column}
.lockup{width:236px;height:auto;color:#ecebe6}
h1{margin-top:auto;font-weight:500;font-size:50px;line-height:1.06;letter-spacing:-0.028em}
h1 span{color:#8fb3ff}
p{margin-top:20px;font-size:19px;line-height:1.45;color:#9a9ba6;max-width:440px;letter-spacing:-0.005em}
.stats{display:flex;gap:0;margin-top:44px;border-top:1px solid rgba(255,255,255,0.1);padding-top:22px}
.stat{padding-right:34px;margin-right:34px;border-right:1px solid rgba(255,255,255,0.08)}
.stat:last-child{border:0}
.v{font-size:26px;font-weight:500;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}
.l{margin-top:4px;font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#82838e}
</style></head><body>
<div class="glow"></div><canvas></canvas><div class="scrim"></div>
<div class="copy">
  ${lockup}
  <h1>Every star within<br>${meta.radiusLy} light-years,<br><span>in true 3D.</span></h1>
  <p>Plot routes, travel times and trade networks across the real stellar neighbourhood.</p>
  <div class="stats">${stats
    .map(
      (s) =>
        `<div class="stat"><div class="v">${s.value}</div><div class="l">${s.label}</div></div>`,
    )
    .join('')}</div>
</div>
</body></html>`;

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

async function main() {
  const imageOnly = process.argv.includes('--image');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // tsx names functions with a __name helper that the page doesn't have.
  await page.setContent(html);
  await page.evaluate('window.__name = (f) => f;');
  await page.evaluate(async () => {
    await document.fonts.load('500 13px Inter');
    await document.fonts.ready;
  });

  const render = (frame: OgFrame) => page.evaluate(drawOgFrame, frame);

  await render({ ...base, azimuth: STILL_AZIMUTH, routeProgress: 1, routeOpacity: 1 });
  await page.screenshot({ path: resolve(root, 'public/og-image.png') });
  console.log('Wrote public/og-image.png');

  if (!imageOnly) {
    const out = resolve(root, 'public/og-video.mp4');
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-framerate',
        String(FPS),
        '-i',
        '-',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '24',
        '-pix_fmt',
        'yuv420p',
        '-tune',
        'animation',
        '-movflags',
        '+faststart',
        '-an',
        out,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const done = new Promise<void>((res, rej) =>
      ffmpeg.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))),
    );
    const frames = FPS * LOOP_SECONDS;
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      // The camera sways either side of the still's angle and back, so the last frame meets the
      // first and the routes never turn edge-on; routes draw in, hold, then fade out.
      const phase = (i / frames) * Math.PI * 2;
      await render({
        ...base,
        azimuth: STILL_AZIMUTH - 0.55 * Math.sin(phase),
        elevation: base.elevation + 0.12 * (1 - Math.cos(phase)) * 0.5,
        routeProgress: smooth(1.2, 5.5, t),
        routeOpacity: 1 - smooth(LOOP_SECONDS - 2.2, LOOP_SECONDS - 0.9, t),
      });
      const buf = await page.screenshot({ type: 'png' });
      if (!ffmpeg.stdin.write(buf)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    }
    ffmpeg.stdin.end();
    await done;
    console.log(`Wrote public/og-video.mp4 (${frames} frames)`);
  }
  await browser.close();
}

await main();
