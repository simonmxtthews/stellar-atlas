import { Matrix4, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { countInFrame } from '../../../src/lib/inFrame';

function viewProjection(camera: PerspectiveCamera): number[] {
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return matrix.elements;
}

// Looking down -z from the origin, 90° tall and square.
const camera = new PerspectiveCamera(90, 1, 0.1, 1000);
const vp = viewProjection(camera);

describe('countInFrame', () => {
  it('counts shown stars in front of the camera and inside the view', () => {
    const positions = new Float32Array(
      [
        [0, 0, -10], // dead ahead
        [5, 5, -10], // inside the 45° half-angle
        [20, 0, -10], // off to the side
        [0, 0, 10], // behind
        [0, 0, -2000], // past the far plane
      ].flat(),
    );
    const indices: number[] = [];
    expect(countInFrame(positions, new Uint8Array([1, 1, 1, 1, 1]), vp, indices)).toBe(2);
    expect(indices).toEqual([0, 1]);
  });

  it('skips stars the filters hide', () => {
    const positions = new Float32Array([0, 0, -10, 1, 1, -10]);
    expect(countInFrame(positions, new Uint8Array([0, 1]), vp)).toBe(1);
    expect(countInFrame(positions, new Uint8Array([0, 0]), vp)).toBe(0);
  });

  it('follows the camera as it turns', () => {
    const turned = new PerspectiveCamera(90, 1, 0.1, 1000);
    turned.rotation.y = Math.PI; // now looking down +z
    const positions = new Float32Array([0, 0, -10, 0, 0, 10]);
    expect(countInFrame(positions, new Uint8Array([1, 1]), viewProjection(turned))).toBe(1);
  });
});
