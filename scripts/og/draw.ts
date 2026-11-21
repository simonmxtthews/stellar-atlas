// Draws one frame of the social card's star map onto the page's canvas. It runs inside the browser
// (Playwright serialises it), so it may use only its argument and browser globals.

export interface OgStar {
  /** Galactic x, y, z in light-years; z is galactic north. */
  readonly p: readonly [number, number, number];
  readonly color: string;
  readonly absMag: number;
}

export interface OgRoute {
  readonly stops: readonly {
    readonly name: string;
    readonly p: readonly [number, number, number];
  }[];
  /** Distance of each leg in light-years, one fewer than the stops. */
  readonly legsLy: readonly number[];
}

export interface OgFrame {
  readonly stars: readonly OgStar[];
  readonly routes: readonly OgRoute[];
  readonly radiusLy: number;
  /** Camera azimuth around galactic north, in radians. */
  readonly azimuth: number;
  /** Camera elevation above the galactic plane, in radians. */
  readonly elevation: number;
  /** How much of the routes is drawn, 0 to 1. */
  readonly routeProgress: number;
  /** Opacity of route labels and markers, 0 to 1. */
  readonly routeOpacity: number;
  readonly centre: readonly [number, number];
  /** Screen pixels per light-year at the Sun's depth. */
  readonly scale: number;
}

export function drawOgFrame(f: OgFrame): void {
  const canvas = document.querySelector('canvas');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) throw new Error('No canvas');
  const dpr = window.devicePixelRatio;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const R = f.radiusLy;
  const camDist = R * 2.6;
  const focal = f.scale * camDist;
  const ca = Math.cos(f.azimuth);
  const sa = Math.sin(f.azimuth);
  const ce = Math.cos(f.elevation);
  const se = Math.sin(f.elevation);
  const [cx, cy] = f.centre;

  // Returns screen x, y, depth (positive is away from the camera) and perspective scale.
  const project = (p: readonly [number, number, number]) => {
    const right = p[0] * ca + p[1] * sa;
    const fwd = -p[0] * sa + p[1] * ca;
    const up = p[2] * ce - fwd * se;
    const depth = fwd * ce + p[2] * se;
    const k = focal / (camDist + depth);
    return { x: cx + right * k, y: cy - up * k, depth, k: k / f.scale };
  };
  const fog = (depth: number) => 0.32 + 0.68 * Math.min(1, Math.max(0, (R - depth) / (2 * R)));

  // Range rings and spokes in the galactic plane.
  ctx.lineWidth = 1;
  for (let ring = 25; ring <= R; ring += 25) {
    ctx.strokeStyle = ring === R ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.055)';
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      const s = project([Math.cos(a) * ring, Math.sin(a) * ring, 0]);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const a0 = project([Math.cos(a) * 25, Math.sin(a) * 25, 0]);
    const a1 = project([Math.cos(a) * R, Math.sin(a) * R, 0]);
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(a1.x, a1.y);
    ctx.stroke();
  }

  // Stars, far to near, added together like light.
  const projected = f.stars
    .map((s) => ({ s, q: project(s.p) }))
    .sort((a, b) => b.q.depth - a.q.depth);
  ctx.globalCompositeOperation = 'lighter';
  for (const { s, q } of projected) {
    const bright = Math.min(1, Math.max(0, (9 - s.absMag) / 10));
    const r = (0.4 + bright * 1.55) * Math.max(0.75, q.k);
    const a = fog(q.depth) * (0.45 + bright * 0.55);
    if (s.absMag < 1.5) {
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 6);
      g.addColorStop(0, hexA(s.color, 0.2 * a));
      g.addColorStop(1, hexA(s.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = hexA(s.color, a);
    ctx.beginPath();
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // The Sun at the centre.
  const sun = project([0, 0, 0]);
  const sg = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 22);
  sg.addColorStop(0, 'rgba(255,242,230,0.55)');
  sg.addColorStop(0.25, 'rgba(255,242,230,0.16)');
  sg.addColorStop(1, 'rgba(255,242,230,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff6ec';
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Routes: drawn leg by leg as routeProgress runs from 0 to 1.
  const accent = '#8fb3ff';
  const labels: { x: number; y: number; text: string; kind: 'name' | 'leg' }[] = [];
  for (const route of f.routes) {
    const pts = route.stops.map((s) => project(s.p));
    const legs = route.legsLy.length;
    const drawn = f.routeProgress * legs;

    // Drop lines from each stop to the plane, as the app draws them.
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = `rgba(143,179,255,${0.35 * f.routeOpacity})`;
    route.stops.forEach((s, i) => {
      if (i === 0 || i > Math.ceil(drawn)) return;
      const top = pts[i];
      const foot = project([s.p[0], s.p[1], 0]);
      if (!top) return;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = f.routeOpacity;
    ctx.lineWidth = 1.75;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(143,179,255,0.7)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < legs; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const t = Math.min(1, Math.max(0, drawn - i));
      if (t <= 0) break;
      const e = t * t * (3 - 2 * t);
      if (i === 0) ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e);
      if (t >= 1 && Math.hypot(b.x - a.x, b.y - a.y) > 70) {
        labels.push({
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          text: `${route.legsLy[i]?.toFixed(1)} ly`,
          kind: 'leg',
        });
      }
    }
    ctx.stroke();
    ctx.restore();

    route.stops.forEach((s, i) => {
      const q = pts[i];
      if (!q || i === 0 || i > Math.floor(drawn + 1e-6)) return;
      ctx.strokeStyle = `rgba(143,179,255,${f.routeOpacity})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      labels.push({ x: q.x, y: q.y - 15, text: s.name, kind: 'name' });
    });
  }

  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(236,235,230,0.9)`;
  ctx.font = '500 13px Inter';
  ctx.fillText('Sol', sun.x - ctx.measureText('Sol').width - 10, sun.y);

  ctx.globalAlpha = f.routeOpacity;
  for (const l of labels) {
    if (l.kind === 'name') {
      ctx.font = '500 13px Inter';
      ctx.fillStyle = 'rgba(236,235,230,0.92)';
      ctx.shadowColor = 'rgba(10,11,14,0.95)';
      ctx.shadowBlur = 6;
      ctx.fillText(l.text, l.x - ctx.measureText(l.text).width / 2, l.y);
      ctx.shadowBlur = 0;
    } else {
      ctx.font = '500 11px Inter';
      const tw = ctx.measureText(l.text).width;
      const pw = tw + 14;
      const ph = 19;
      ctx.fillStyle = 'rgba(15,16,21,0.92)';
      ctx.strokeStyle = 'rgba(143,179,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(l.x - pw / 2, l.y - ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c7d8ff';
      ctx.fillText(l.text, l.x - tw / 2, l.y + 0.5);
    }
  }
  ctx.globalAlpha = 1;

  function hexA(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
  }
}
