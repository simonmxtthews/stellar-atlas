// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bolometricLuminosity,
  habitableZone,
  isMainSequence,
  massFromLuminosity,
} from '../../../scripts/lib/derive';

describe('bolometricLuminosity', () => {
  it('gives the Sun about one solar luminosity', () => {
    expect(bolometricLuminosity(4.85, 5772)).toBeCloseTo(0.96, 1);
  });

  it('recovers what the V band misses for Proxima Centauri', () => {
    const lum = bolometricLuminosity(15.447, 3060);
    expect(lum).toBeGreaterThan(0.001);
    expect(lum).toBeLessThan(0.0025);
  });
});

describe('massFromLuminosity', () => {
  it.each([
    [1, 1, 0.01],
    [0.0016, 0.12, 0.02], // Proxima Centauri
    [25, 2.2, 0.2], // Sirius A
  ])('turns %f L☉ into about %f M☉', (lum, mass, tolerance) => {
    expect(Math.abs(massFromLuminosity(lum) - mass)).toBeLessThanOrEqual(tolerance);
  });

  it('never decreases with luminosity', () => {
    let previous = 0;
    for (let log = -5; log <= 6; log += 0.05) {
      const mass = massFromLuminosity(10 ** log);
      expect(mass).toBeGreaterThanOrEqual(previous * 0.97);
      previous = mass;
    }
  });
});

describe('isMainSequence', () => {
  it('follows a stated luminosity class', () => {
    expect(isMainSequence({ cls: 'G', lumClass: 'V' }, 1)).toBe(true);
    expect(isMainSequence({ cls: 'K', lumClass: 'III' }, 50)).toBe(false);
    expect(isMainSequence({ cls: 'M', lumClass: 'VI' }, 0.003)).toBe(false);
  });

  it('assumes a dwarf without a class unless too luminous for one', () => {
    expect(isMainSequence({ cls: 'M' }, 0.01)).toBe(true);
    expect(isMainSequence({ cls: 'K' }, 60)).toBe(false);
  });

  it('excludes white dwarfs, brown dwarfs and unknowns', () => {
    for (const cls of ['D', 'L', 'T', 'Y', 'unknown'] as const) {
      expect(isMainSequence({ cls }, 0.001)).toBe(false);
    }
  });
});

describe('habitableZone', () => {
  it('brackets Earth for the Sun', () => {
    const [inner, outer] = habitableZone(1);
    expect(inner).toBeLessThan(1);
    expect(outer).toBeGreaterThan(1);
  });

  it('scales with the square root of luminosity', () => {
    const [inner] = habitableZone(4);
    expect(inner).toBeCloseTo(2 * habitableZone(1)[0]);
  });
});
