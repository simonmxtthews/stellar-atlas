import { Matrix4, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { flyPose } from '../../../src/lib/camera';
import { pickPoint } from '../../../src/lib/pick';

describe('flyPose', () => {
  it('moves the orbit target to the star and closes in along the view direction', () => {
    const pose = flyPose([10, 0, 0], [0, 0, 100], [0, 0, 0]);
    expect(pose.target).toEqual([10, 0, 0]);
    expect(pose.position).toEqual([10, 0, 20]);
  });

  it('does not back away when the camera is already close', () => {
    const pose = flyPose([10, 0, 0], [0, 0, 5], [0, 0, 0]);
    expect(pose.position).toEqual([10, 0, 5]);
  });
});

describe('pickPoint', () => {
  const viewport = { width: 800, height: 600 };
  const camera = new PerspectiveCamera(50, viewport.width / viewport.height, 0.1, 2000);
  camera.position.set(0, 0, 100);
  camera.updateMatrixWorld();
  const { elements } = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  // Centre of the screen, off-centre to the right, and behind the camera.
  const positions = new Float32Array([0, 0, 0, 20, 0, 0, 0, 0, 150]);

  function pick(x: number, y: number, mask = new Uint8Array([1, 1, 1])): number {
    return pickPoint(positions, mask, elements, viewport, x, y, 12);
  }

  it('finds the point under the cursor within the pixel radius', () => {
    expect(pick(400, 300)).toBe(0);
    expect(pick(408, 305)).toBe(0);
    expect(pick(400, 340)).toBe(-1);
  });

  it('prefers the nearer of two candidates on screen', () => {
    const offset = new Float32Array([0, 0, 0, 1, 0, 0]);
    const pixelsPerLy = 600 / (2 * Math.tan((25 * Math.PI) / 180)) / 100;
    const cursorX = 400 + pixelsPerLy * 0.9;
    const index = pickPoint(offset, new Uint8Array([1, 1]), elements, viewport, cursorX, 300, 12);
    expect(index).toBe(1);
  });

  it('ignores hidden points and points behind the camera', () => {
    expect(pick(400, 300, new Uint8Array([0, 1, 1]))).toBe(-1);
    expect(pick(400, 300, new Uint8Array([0, 0, 1]))).toBe(-1);
  });
});
