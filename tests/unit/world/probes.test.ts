import { describe, expect, it } from 'vitest';
import { closestApproaches, probePathEnd, probePositionAt } from '../../../src/lib/probes';
import type { Probe, StarMotion } from '../../../src/types/catalogue';
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

  it('follows a moving star from its catalogue epoch, finding what a fixed one would miss', () => {
    // Listed as of 2000; by the probe's epoch of 2025 it is at y = -5, then meets the probe head on
    // 10,000 years later.
    const pos = [11, -5.0125, 0] as const;
    const star = starOf({ id: 'moving', pos });
    const moving = systemOf(star, { motion: { velLyPerYear: [0, 0.0005, 0], radialKnown: true } });
    const [found] = closestApproaches(probe, 2025, [moving], 3);
    expect(found?.distanceLy).toBeCloseTo(0, 6);
    expect(found?.year).toBeCloseTo(12_025, 3);
    expect(closestApproaches(probe, 2025, [systemOf(star)], 3)).toEqual([]);
  });

  it('marks a star rough unless its radial velocity is known', () => {
    const star = starOf({ id: 's', pos: [3, 1, 0] });
    const velLyPerYear = [0, 0, 0] as const;
    const roughOf = (motion?: StarMotion) =>
      closestApproaches(probe, 2025, [systemOf(star, motion ? { motion } : {})], 3)[0]?.rough;
    expect(roughOf()).toBe(true);
    expect(roughOf({ velLyPerYear, radialKnown: false })).toBe(true);
    expect(roughOf({ velLyPerYear, radialKnown: true })).toBe(false);
  });

  it('ignores a meeting beyond the horizon, and a star keeping pace with the probe', () => {
    const slow: Probe = { ...probe, velLyPerYear: [0.0001, 0, 0] };
    expect(closestApproaches(slow, 2025, [at('in-time', [10, 0.5, 0])], 3)).toHaveLength(1);
    expect(closestApproaches(slow, 2025, [at('too-late', [12, 0.5, 0])], 3)).toEqual([]);
    const pacing = systemOf(starOf({ id: 'pacing', pos: [3, 0, 0] }), {
      motion: { velLyPerYear: probe.velLyPerYear, radialKnown: true },
    });
    expect(closestApproaches(probe, 2025, [pacing], 3)).toEqual([]);
  });

  it('leaves out what the probe has already passed', () => {
    expect(closestApproaches(probe, 2025, [at('behind', [-1, 0.5, 0])], 3)).toEqual([]);
  });
});
