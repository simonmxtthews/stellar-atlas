import { describe, expect, it } from 'vitest';
import { closestApproaches, probePathEnd, probePositionAt } from '../../../src/lib/probes';
import type { Probe } from '../../../src/types/catalogue';
import { starOf, systemOf } from '../map/fixtures';

const probe: Probe = {
  id: 'p',
  name: 'Probe',
  pos: [1, 0, 0],
  velLyPerYear: [0.001, 0, 0],
  speedKmS: 300,
};

const at = (id: string, pos: readonly [number, number, number]) =>
  systemOf(starOf({ id, pos, distLy: Math.hypot(...pos) }));

describe('probe paths', () => {
  it('extrapolates in a straight line from the reference epoch', () => {
    expect(probePositionAt(probe, 2025, 2025)).toEqual([1, 0, 0]);
    expect(probePositionAt(probe, 2025, 3025)).toEqual([2, 0, 0]);
  });

  it('draws on along the heading', () => {
    expect(probePathEnd(probe, 100)).toEqual([101, 0, 0]);
  });
});

describe('closest approaches', () => {
  it('gives the closest distance and year, soonest first', () => {
    const far = at('far', [5, 2, 0]);
    const near = at('near', [3, 1, 0]);
    const found = closestApproaches(probe, 2025, [far, near], 3);
    expect(found.map(({ system }) => system.id)).toEqual(['sys:near', 'sys:far']);
    expect(found[0]?.distanceLy).toBeCloseTo(1);
    expect(found[0]?.year).toBeCloseTo(4025);
    expect(found[1]?.distanceLy).toBeCloseTo(2);
    expect(found[1]?.year).toBeCloseTo(6025);
  });

  it('leaves out what is too far from the path', () => {
    expect(closestApproaches(probe, 2025, [at('wide', [3, 4, 0])], 3)).toEqual([]);
  });

  it('leaves out what the probe has already passed', () => {
    expect(closestApproaches(probe, 2025, [at('behind', [-1, 0.5, 0])], 3)).toEqual([]);
  });
});
