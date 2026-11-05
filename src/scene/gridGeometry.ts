import type { BufferAttribute } from 'three';
import { starPosition } from './starAttributes';

export const RING_STEP_LY = 5;
export const GRID_STEP_LY = 10;
const RING_SEGMENTS = 128;

// Vertices are line-segment pairs on the y = 0 plane (the galactic plane in scene coordinates).

export function ringRadii(radiusLy: number, step = RING_STEP_LY): number[] {
  const count = Math.floor(radiusLy / step + 1e-9);
  return Array.from({ length: count }, (_, i) => (i + 1) * step);
}

export function ringVertices(radii: readonly number[]): Float32Array {
  const vertices = new Float32Array(radii.length * RING_SEGMENTS * 6);
  let v = 0;
  for (const radius of radii) {
    for (let s = 0; s < RING_SEGMENTS; s++) {
      const a0 = (s / RING_SEGMENTS) * Math.PI * 2;
      const a1 = ((s + 1) / RING_SEGMENTS) * Math.PI * 2;
      vertices.set([radius * Math.cos(a0), 0, radius * Math.sin(a0)], v);
      vertices.set([radius * Math.cos(a1), 0, radius * Math.sin(a1)], v + 3);
      v += 6;
    }
  }
  return vertices;
}

// Square grid through the origin, clipped to a circle of the given radius.
export function gridVertices(radiusLy: number, step = GRID_STEP_LY): Float32Array {
  const segments: number[] = [];
  const steps = Math.floor(radiusLy / step);
  for (let i = -steps; i <= steps; i++) {
    const offset = i * step;
    const half = Math.sqrt(radiusLy * radiusLy - offset * offset);
    segments.push(offset, 0, -half, offset, 0, half);
    segments.push(-half, 0, offset, half, 0, offset);
  }
  return new Float32Array(segments);
}

// One segment per star, from the star straight down (or up) to the plane.
export function dropLineVertices(positions: Float32Array): Float32Array {
  const count = positions.length / 3;
  const vertices = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = starPosition(positions, i);
    vertices.set([x, y, z, x, 0, z], i * 6);
  }
  return vertices;
}

export function writeDropLineVisibility(visibility: BufferAttribute, mask: Uint8Array): void {
  mask.forEach((visible, i) => {
    visibility.setX(i * 2, visible);
    visibility.setX(i * 2 + 1, visible);
  });
  visibility.needsUpdate = true;
}
