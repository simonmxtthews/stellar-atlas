import type { Matrix4Tuple } from 'three';

export const MAX_LABELS = 150;
export const LABEL_PX = 12;
export const SELECTED_LABEL_PX = 14;
export const LABEL_GAP_EM = 1.1; // clear of the star sprite
export const SELECTED_LABEL_GAP_EM = 2.2; // clear of the selection ring

const CHAR_WIDTH_EM = 0.55; // average, as text isn't typeset until it is shown

// Lower ranks first: selected > route endpoints > tagged > proper-named > everything else.
export const LabelTier = { Selected: 0, RouteEndpoint: 1, Tagged: 2, Proper: 3, Other: 4 } as const;
export type LabelTier = (typeof LabelTier)[keyof typeof LabelTier];

export interface LabelCandidate {
  readonly id: string;
  readonly text: string;
  readonly tier: LabelTier;
  readonly x: number; // scene coordinates
  readonly y: number;
  readonly z: number;
}

export interface LabelViewport {
  readonly width: number;
  readonly height: number;
}

interface LabelBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

// Labels ranked by tier, then nearest to the camera, capped at maxLabels. A label that would
// overlap a higher-ranked one, or that falls off-screen, gives up its place. Selected labels are
// forced: they ignore the cap, the frustum and overlaps. m is the column-major view-projection
// matrix.
export function chooseLabels<T extends LabelCandidate>(
  candidates: readonly T[],
  camera: readonly [number, number, number],
  m: Readonly<Matrix4Tuple>,
  viewport: LabelViewport,
  maxLabels: number = MAX_LABELS,
): readonly T[] {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      distSq:
        (candidate.x - camera[0]) ** 2 +
        (candidate.y - camera[1]) ** 2 +
        (candidate.z - camera[2]) ** 2,
    }))
    .sort((a, b) => a.candidate.tier - b.candidate.tier || a.distSq - b.distSq);

  const chosen: T[] = [];
  const placed: LabelBox[] = [];
  for (const { candidate } of ranked) {
    const forced = candidate.tier === LabelTier.Selected;
    if (!forced && chosen.length >= maxLabels) break;
    const box = labelBox(candidate, m, viewport);
    if (!forced && (!box || placed.some((other) => overlaps(box, other)))) continue;
    chosen.push(candidate);
    if (box) placed.push(box);
  }
  return chosen;
}

// Screen rectangle of a label, or null when its star is outside the view.
function labelBox(
  { x, y, z, text, tier }: LabelCandidate,
  m: Readonly<Matrix4Tuple>,
  viewport: LabelViewport,
): LabelBox | null {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (w <= 0) return null;
  const ndcX = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  const ndcY = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) return null;
  const selected = tier === LabelTier.Selected;
  const px = selected ? SELECTED_LABEL_PX : LABEL_PX;
  const left =
    ((ndcX + 1) / 2) * viewport.width + (selected ? SELECTED_LABEL_GAP_EM : LABEL_GAP_EM) * px;
  const middle = ((1 - ndcY) / 2) * viewport.height;
  return {
    left,
    right: left + text.length * CHAR_WIDTH_EM * px,
    top: middle - px / 2,
    bottom: middle + px / 2,
  };
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// The bundled label font covers Latin-1 only. Any other glyph would make troika download a
// fallback font from its CDN, and the app makes no runtime network calls.
export function labelText(name: string): string {
  return name.replace(/[^ -~ -ÿ]/gu, '?');
}
