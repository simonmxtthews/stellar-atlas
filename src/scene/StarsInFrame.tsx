import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Matrix4 } from 'three';
import { countInFrame } from '../lib/inFrame';
import { useUi } from '../store/ui';

// The list re-sorts on every change, so while the camera moves it hears at most this often.
const LIST_EVERY_MS = 250;

function sameIndices(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((index, i) => index === b[i]);
}

// Counts the shown stars on screen each frame, for the count in the corner, and while the star list
// is open or the count is hovered, which ones. Draws nothing. A few thousand projections a frame is cheap; the store only
// hears about it when something changes.
export function StarsInFrame({
  positions,
  mask,
}: {
  readonly positions: Float32Array;
  readonly mask: Uint8Array;
}) {
  const viewProjection = useMemo(() => new Matrix4(), []);
  const listedAt = useRef(-Infinity);

  useFrame(({ camera }) => {
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const state = useUi.getState();
    const now = performance.now();
    const wanted = state.starListOpen || state.starCountHovered;
    const listing = wanted && now - listedAt.current >= LIST_EVERY_MS;
    const indices = listing ? [] : undefined;
    const count = countInFrame(positions, mask, viewProjection.elements, indices);
    if (state.starsInFrame !== count) state.setStarsInFrame(count);
    if (indices) {
      listedAt.current = now;
      if (!sameIndices(indices, state.framedStarIndices)) state.setFramedStarIndices(indices);
    }
  });
  return null;
}
