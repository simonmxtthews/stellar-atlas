// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  angularSeparationArcsec,
  equatorialPcToGalacticLy,
  raDecToEquatorial,
} from '../../../scripts/lib/coords';

const length = ([x, y, z]: readonly [number, number, number]) => Math.hypot(x, y, z);

describe('equatorial to galactic', () => {
  it('sends the Sun to the origin', () => {
    expect(length(equatorialPcToGalacticLy([0, 0, 0]))).toBe(0);
  });

  it('places Alpha Centauri A at about 4.37 ly', () => {
    const pos = equatorialPcToGalacticLy([-0.495203, -0.414084, -1.156625]);
    expect(Math.abs(length(pos) - 4.37)).toBeLessThanOrEqual(0.05);
  });

  it('places Sirius A at about 8.6 ly', () => {
    const pos = equatorialPcToGalacticLy([-0.494323, 2.476731, -0.758485]);
    expect(Math.abs(length(pos) - 8.6)).toBeLessThanOrEqual(0.05);
  });

  it('maps the galactic-centre direction to +X within 0.1°', () => {
    const [x, y, z] = equatorialPcToGalacticLy(raDecToEquatorial(266.405, -28.936, 1));
    const angleDeg = (Math.acos(x / Math.hypot(x, y, z)) * 180) / Math.PI;
    expect(x).toBeGreaterThan(0);
    expect(angleDeg).toBeLessThan(0.1);
  });

  it('maps the north galactic pole to +Z', () => {
    const [x, y, z] = equatorialPcToGalacticLy(raDecToEquatorial(192.85948, 27.12825, 1));
    expect(z / Math.hypot(x, y, z)).toBeGreaterThan(0.999999);
  });

  it('preserves length', () => {
    const v = [3, -4, 12] as const;
    expect(length(equatorialPcToGalacticLy(v))).toBeCloseTo(13 * 3.261564, 6);
  });
});

describe('angularSeparationArcsec', () => {
  it('measures a small declination offset', () => {
    expect(angularSeparationArcsec(10, 20, 10, 20 + 60 / 3600)).toBeCloseTo(60, 6);
  });

  it('shrinks right-ascension offsets by cos(dec)', () => {
    expect(angularSeparationArcsec(10, 60, 10 + 60 / 3600, 60)).toBeCloseTo(30, 3);
  });

  it('handles the wrap at RA 0', () => {
    expect(angularSeparationArcsec(359.99, 0, 0.01, 0)).toBeCloseTo(72, 3);
  });
});
