import { Matrix4, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import {
  chooseLabels,
  LabelTier,
  labelText,
  MAX_LABELS,
  type LabelCandidate,
} from '../../../src/lib/labels';

// Camera at +z looking at the origin.
const camera = new PerspectiveCamera(50, 1, 0.1, 2000);
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const viewProjection = new Matrix4().multiplyMatrices(
  camera.projectionMatrix,
  camera.matrixWorldInverse,
).elements;
const CAMERA = [0, 0, 100] as const;

// Big enough that labels only overlap where a test puts them on top of each other.
const VIEWPORT = { width: 100_000, height: 100_000 };

function candidate(id: string, tier: LabelTier, z = 0, x = 0, y = 0): LabelCandidate {
  return { id, text: id, tier, x, y, z };
}

function choose(candidates: readonly LabelCandidate[], maxLabels?: number) {
  return chooseLabels(candidates, CAMERA, viewProjection, VIEWPORT, maxLabels);
}

function ids(labels: readonly LabelCandidate[]): readonly string[] {
  return labels.map((label) => label.id);
}

describe('chooseLabels', () => {
  it('ranks selected > route endpoint > tagged > proper-named > other', () => {
    const labels = choose([
      candidate('other', LabelTier.Other, 0, 0, 40),
      candidate('proper', LabelTier.Proper, 0, 0, 30),
      candidate('tagged', LabelTier.Tagged, 0, 0, 20),
      candidate('route', LabelTier.RouteEndpoint, 0, 0, 10),
      candidate('selected', LabelTier.Selected),
    ]);
    expect(ids(labels)).toEqual(['selected', 'route', 'tagged', 'proper', 'other']);
  });

  it('orders within a tier by distance from the camera', () => {
    const labels = choose([
      candidate('far', LabelTier.Other, -50, 0, 10),
      candidate('near', LabelTier.Other, 50),
    ]);
    expect(ids(labels)).toEqual(['near', 'far']);
  });

  it('caps the count, keeping the highest priorities', () => {
    const others = Array.from({ length: 400 }, (_, i) =>
      candidate(`o${i}`, LabelTier.Other, 0, i / 10),
    );
    const labels = choose([...others, candidate('proper', LabelTier.Proper, 0, 0, 10)]);
    expect(labels).toHaveLength(MAX_LABELS);
    expect(labels[0]?.id).toBe('proper');
  });

  it('never drops a selected label, even past the cap', () => {
    const selected = Array.from({ length: 5 }, (_, i) =>
      candidate(`s${i}`, LabelTier.Selected, 0, 0, i * 10),
    );
    const labels = choose([candidate('proper', LabelTier.Proper, 0, 20), ...selected], 3);
    expect(ids(labels)).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });

  it('spends no budget off-screen, except on selected labels', () => {
    const labels = choose([
      candidate('behind', LabelTier.Proper, 200),
      candidate('beside', LabelTier.Proper, 0, 500),
      candidate('selected behind', LabelTier.Selected, 200),
      candidate('in view', LabelTier.Other),
    ]);
    expect(ids(labels)).toEqual(['selected behind', 'in view']);
  });

  it('drops a label overlapping a higher-ranked one, unless it is selected', () => {
    const overlapping = chooseLabels(
      [
        candidate('low', LabelTier.Other),
        candidate('high', LabelTier.Proper),
        candidate('apart', LabelTier.Other, 0, 0, 20),
      ],
      CAMERA,
      viewProjection,
      { width: 1000, height: 1000 },
    );
    expect(ids(overlapping)).toEqual(['high', 'apart']);

    const forced = chooseLabels(
      [candidate('one', LabelTier.Selected), candidate('two', LabelTier.Selected)],
      CAMERA,
      viewProjection,
      { width: 1000, height: 1000 },
    );
    expect(ids(forced)).toEqual(['one', 'two']);
  });
});

describe('labelText', () => {
  it('keeps Latin-1 names, including those in the catalogue', () => {
    expect(labelText("Barnard's Star")).toBe("Barnard's Star");
    expect(labelText('Gröombridge Añá')).toBe('Gröombridge Añá');
  });

  it('replaces glyphs the bundled font lacks, so troika never fetches a CDN fallback', () => {
    expect(labelText('α Cen')).toBe('? Cen');
    expect(labelText('新星')).toBe('??');
  });
});
