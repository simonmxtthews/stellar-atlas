// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bvToTemperature,
  classColour,
  parseSpectral,
  spectralTemperature,
  temperatureToHex,
} from '../../../scripts/lib/spectral';

describe('parseSpectral', () => {
  it.each([
    ['G2V', { cls: 'G', sub: 2, lumClass: 'V' }],
    ['M5.5Ve', { cls: 'M', sub: 5.5, lumClass: 'V' }],
    ['K0III', { cls: 'K', sub: 0, lumClass: 'III' }],
    ['DA2', { cls: 'D', sub: 2 }],
    ['sdM1', { cls: 'M', sub: 1, lumClass: 'VI' }],
    ['L8', { cls: 'L', sub: 8 }],
    ['T7.5', { cls: 'T', sub: 7.5 }],
  ])('reads %s', (raw, expected) => {
    expect(parseSpectral(raw)).toEqual({ raw, ...expected });
  });

  it.each([[''], ['   '], [undefined]])('treats %j as unknown', (raw) => {
    expect(parseSpectral(raw)).toEqual({ cls: 'unknown' });
  });

  // Every string below appears in HYG or the Exoplanet Archive.
  it.each([
    ['dM5.5e', 'M', 5.5, 'V'],
    ['dM5  e', 'M', 5, 'V'],
    ['M5.5 V e', 'M', 5.5, 'V'],
    ['m', 'M', undefined, undefined],
    ['k-m', 'K', undefined, undefined],
    ['g-k', 'G', undefined, undefined],
    ['m3 V', 'M', 3, 'V'],
    ['M V', 'M', undefined, 'V'],
    ['M:', 'M', undefined, undefined],
    ['Mp', 'M', undefined, undefined],
    ['A0m...', 'A', 0, undefined],
    ['A0Vvar', 'A', 0, 'V'],
    ['F5IV-V', 'F', 5, 'IV-V'],
    ['F7/F8IV/V', 'F', 7, 'IV/V'],
    ['K0III-IV...', 'K', 0, 'III-IV'],
    ['K5/M0V', 'K', 5, 'V'],
    ['F6IVwvar', 'F', 6, 'IV'],
    ['A3V: + F9V', 'A', 3, 'V'],
    ['G2V + G2V', 'G', 2, 'V'],
    ['K5V comp SB', 'K', 5, 'V'],
    ['M4.0±1.0 V', 'M', 4, 'V'],
    ['M4 +/- 0.5 V', 'M', 4, 'V'],
    ['M0.5+/-0.5 V', 'M', 0.5, 'V'],
    ['M(6.1 +/- 0.7) V', 'M', 6.1, 'V'],
    ['M4.5-M5.0', 'M', 4.5, undefined],
    ['DC9+', 'D', 9, undefined],
    ['DAw', 'D', undefined, undefined],
    ['DQ', 'D', undefined, undefined],
    ['Y', 'Y', undefined, undefined],
  ])('reads the real-world string %s', (raw, cls, sub, lumClass) => {
    const parsed = parseSpectral(raw);
    expect(parsed.cls).toBe(cls);
    expect(parsed.sub).toBe(sub);
    expect(parsed.lumClass).toBe(lumClass);
  });

  it('keeps the raw text of a class the model has no slot for', () => {
    expect(parseSpectral('Se')).toEqual({ raw: 'Se', cls: 'unknown' });
  });
});

describe('temperature', () => {
  it('converts B−V to the right temperature for known stars', () => {
    expect(bvToTemperature(0.656)).toBeGreaterThan(5600);
    expect(bvToTemperature(0.656)).toBeLessThan(6000);
    expect(bvToTemperature(0.009)).toBeGreaterThan(9500);
    expect(bvToTemperature(1.807)).toBeLessThan(3600);
  });

  it('interpolates between spectral anchors', () => {
    expect(spectralTemperature({ cls: 'M', sub: 5 })).toBe(3060);
    expect(spectralTemperature({ cls: 'M', sub: 5.5 })).toBeCloseTo(2935);
  });

  it('defines white-dwarf subclasses as 50400 K / Teff', () => {
    expect(spectralTemperature({ cls: 'D', sub: 2 })).toBe(25200);
  });

  it('has no temperature for an unknown class', () => {
    expect(spectralTemperature({ cls: 'unknown' })).toBeUndefined();
  });
});

describe('colour', () => {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  it('runs from red-orange through white to blue', () => {
    const [coolR = 0, , coolB = 0] = channels(temperatureToHex(3000));
    const [hotR = 0, , hotB = 0] = channels(temperatureToHex(30000));
    expect(coolR).toBeGreaterThan(coolB);
    expect(hotB).toBeGreaterThan(hotR);
  });

  it('always yields a six-digit hex colour', () => {
    for (const tempK of [100, 1000, 1900, 3000, 5772, 6600, 10000, 40000, 100000]) {
      expect(temperatureToHex(tempK)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('falls back to a colour for every class', () => {
    for (const cls of ['O', 'M', 'Y', 'D', 'unknown'] as const) {
      expect(classColour(cls)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
