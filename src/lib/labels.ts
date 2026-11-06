import type { Matrix4Tuple } from 'three';

export const MAX_LABELS = 150;
export const MAX_UNNAMED_LABELS = 25; // catalogue numbers, the bulk of the clutter
const LABEL_GAP_PX = 13; // clear of the star sprite
const SELECTED_LABEL_GAP_PX = 31; // clear of the selection ring

const CHAR_WIDTH_EM = 0.55; // average, as text isn't typeset until it is shown

// Lower ranks first: selected > route endpoints > tagged > proper-named > everything else.
export const LabelTier = { Selected: 0, RouteEndpoint: 1, Tagged: 2, Proper: 3, Other: 4 } as const;
export type LabelTier = (typeof LabelTier)[keyof typeof LabelTier];

export interface LabelStyle {
  readonly px: number;
  readonly gapEm: number;
  readonly color: string;
}

// The author's own stars stand out; the catalogue recedes, names ahead of numbers.
export function labelStyle(tier: LabelTier): LabelStyle {
  switch (tier) {
    case LabelTier.Selected:
      return { px: 14, gapEm: SELECTED_LABEL_GAP_PX / 14, color: '#dfe8ff' };
    case LabelTier.RouteEndpoint:
    case LabelTier.Tagged:
      return { px: 12, gapEm: LABEL_GAP_PX / 12, color: '#c8c8cc' };
    case LabelTier.Proper:
      return { px: 11, gapEm: LABEL_GAP_PX / 11, color: '#8b8c96' };
    case LabelTier.Other:
      return { px: 10, gapEm: LABEL_GAP_PX / 10, color: '#5f606b' };
  }
}

export interface LabelCandidate {
  readonly id: string;
  readonly text: string;
  readonly tier: LabelTier;
  readonly color?: string; // a route's, for its leg labels
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

// Labels ranked by tier, then nearest to the camera, capped at maxLabels and, for those with only
// a catalogue number, at MAX_UNNAMED_LABELS. A label that would
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
  let unnamed = 0;
  for (const { candidate } of ranked) {
    const forced = candidate.tier === LabelTier.Selected;
    if (!forced && chosen.length >= maxLabels) break;
    if (candidate.tier === LabelTier.Other && unnamed >= MAX_UNNAMED_LABELS) break;
    const box = labelBox(candidate, m, viewport);
    if (!forced && (!box || placed.some((other) => overlaps(box, other)))) continue;
    chosen.push(candidate);
    if (candidate.tier === LabelTier.Other) unnamed++;
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
  const { px, gapEm } = labelStyle(tier);
  const left = ((ndcX + 1) / 2) * viewport.width + gapEm * px;
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
