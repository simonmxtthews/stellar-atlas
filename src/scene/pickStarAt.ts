import type { Camera } from 'three';
import { Matrix4 } from 'three';
import { pickPoint } from '../lib/pick';

const MOUSE_PICK_RADIUS_PX = 12;
export const TOUCH_PICK_RADIUS_PX = 24;

// Index of the visible star under a viewport position, or -1.
export function pickStarAt(
  camera: Camera,
  domElement: HTMLElement,
  positions: Float32Array,
  mask: Uint8Array,
  { clientX, clientY }: { readonly clientX: number; readonly clientY: number },
  radiusPx: number = MOUSE_PICK_RADIUS_PX,
): number {
  const rect = domElement.getBoundingClientRect();
  const viewProjection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  return pickPoint(
    positions,
    mask,
    viewProjection.elements,
    rect,
    clientX - rect.left,
    clientY - rect.top,
    radiusPx,
  );
}
