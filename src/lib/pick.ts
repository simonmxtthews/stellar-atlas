import type { Matrix4Tuple } from 'three';

export interface PickViewport {
  readonly width: number;
  readonly height: number;
}

// Index of the visible point nearest the cursor within maxPx CSS pixels, or -1. Works in screen
// space so the pick tolerance stays the same at every zoom level. m is the column-major
// view-projection matrix.
export function pickPoint(
  positions: Float32Array,
  mask: Uint8Array,
  m: Readonly<Matrix4Tuple>,
  viewport: PickViewport,
  cursorX: number,
  cursorY: number,
  maxPx: number,
): number {
  let best = -1;
  let bestDistSq = maxPx * maxPx;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = positions[i * 3] ?? 0;
    const y = positions[i * 3 + 1] ?? 0;
    const z = positions[i * 3 + 2] ?? 0;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) continue; // behind the camera
    const ndcX = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    const ndcY = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    const dx = ((ndcX + 1) / 2) * viewport.width - cursorX;
    const dy = ((1 - ndcY) / 2) * viewport.height - cursorY;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      best = i;
      bestDistSq = distSq;
    }
  }
  return best;
}
