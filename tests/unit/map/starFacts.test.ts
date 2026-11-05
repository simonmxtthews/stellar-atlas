import { describe, expect, it } from 'vitest';
import { hzFraction, hzScale } from '../../../src/lib/hzStrip';
import { nearestSystems } from '../../../src/lib/neighbours';
import {
  archiveOverviewUrl,
  designations,
  formatSignificant,
  formatValue,
  spectralCode,
  spectralReading,
} from '../../../src/lib/starFacts';
import { systemAnchors } from '../../../src/scene/systemAnchors';
import { starOf, systemOf } from './fixtures';

describe('spectral reading', () => {
  it.each([
    [{ cls: 'K', sub: 1, lumClass: 'V' }, 'orange main-sequence dwarf'],
    [{ cls: 'G', lumClass: 'IV-V' }, 'yellow subgiant'],
    [{ cls: 'K', lumClass: 'III/IV' }, 'orange giant'],
    [{ cls: 'A', lumClass: 'Ia' }, 'white supergiant'],
    [{ cls: 'M', lumClass: 'VI' }, 'red subdwarf'],
    [{ cls: 'F', lumClass: 'Ib-II' }, 'yellow-white supergiant'],
    [{ cls: 'M' }, 'red star'],
    [{ cls: 'D', sub: 2 }, 'white dwarf'],
    [{ cls: 'T', sub: 7.5 }, 'brown dwarf'],
    [{ cls: 'unknown' }, 'spectral type not catalogued'],
  ] as const)('%o reads as %s', (spectral, reading) => {
    expect(spectralReading(spectral)).toBe(reading);
  });

  it('shows the raw type, or rebuilds one from the parsed fields', () => {
    expect(spectralCode({ raw: 'M5.5Ve', cls: 'M' })).toBe('M5.5Ve');
    expect(spectralCode({ cls: 'K', sub: 1, lumClass: 'V' })).toBe('K1 V');
    expect(spectralCode({ cls: 'unknown' })).toBe('Unknown');
  });
});

describe('designations', () => {
  it('lists every name once, leaving out the display name', () => {
    const star = starOf({
      id: 'hyg:1',
      displayName: 'Tau Ceti',
      names: {
        bayer: 'Tau Ceti',
        gliese: 'GJ 71',
        hd: 'HD 10700',
        hip: 'HIP 8102',
        other: ['tau Cet', 'GJ 71'],
      },
    });
    expect(designations(star)).toEqual(['GJ 71', 'HD 10700', 'HIP 8102', 'tau Cet']);
  });
});

describe('formatting', () => {
  it('dashes unknown values', () => {
    expect(formatValue(undefined, 2, 'ly')).toBe('—');
    expect(formatSignificant(undefined, 'L☉')).toBe('—');
  });

  it('fixes decimals, keeping zero a real value', () => {
    expect(formatValue(4.2267, 2, 'ly')).toBe('4.23 ly');
    expect(formatValue(0, 2, 'ly')).toBe('0.00 ly');
    expect(formatValue(5772, 0, 'K')).toBe('5,772 K');
  });

  it('keeps significant figures for wide-ranging values', () => {
    expect(formatSignificant(0.00151, 'L☉')).toBe('0.00151 L☉');
    expect(formatSignificant(25.4, 'L☉')).toBe('25.4 L☉');
  });

  it('links planets to their host page', () => {
    expect(archiveOverviewUrl('16 Cyg B b', 'b')).toBe(
      'https://exoplanetarchive.ipac.caltech.edu/overview/16%20Cyg%20B',
    );
  });
});

describe('nearestSystems', () => {
  it('sorts by 3D distance from the origin system and leaves that system out', () => {
    const at = (id: string, pos: readonly [number, number, number]) =>
      systemOf(starOf({ id, pos }));
    const origin = at('o', [10, 0, 0]);
    const near = at('near', [10, 3, 4]);
    const mid = at('mid', [10, 0, -6]);
    const sol = at('sol', [0, 0, 0]);
    const result = nearestSystems(origin, [sol, mid, origin, near], 2);
    expect(result.map(({ system }) => system.id)).toEqual([near.id, mid.id]);
    expect(result[0]?.distanceLy).toBeCloseTo(5);
    expect(result[1]?.distanceLy).toBeCloseTo(6);
  });
});

describe('HZ strip scale', () => {
  it('spans the zone and every planet, on a log axis', () => {
    const scale = hzScale([1, 2], [0.1, 10]);
    if (!scale) throw new Error('No scale');
    expect(hzFraction(0.1, scale)).toBeGreaterThan(0);
    expect(hzFraction(10, scale)).toBeLessThan(1);
    expect(hzFraction(1, scale)).toBeCloseTo(0.5);
  });

  it('copes with a missing zone, and with nothing at all', () => {
    expect(hzScale(undefined, [1])).not.toBeNull();
    expect(hzScale([1, 2], [])).not.toBeNull();
    expect(hzScale(undefined, [])).toBeNull();
  });
});

describe('systemAnchors', () => {
  const primary = starOf({ id: 'a', systemId: 's' });
  const system = systemOf(primary, { starIds: ['a', 'b'] });
  const index = new Map([
    ['a', 0],
    ['b', 1],
  ]);

  it('anchors to the primary while it is visible', () => {
    const anchors = systemAnchors([system], index, Uint8Array.of(1, 1));
    expect(anchors.map(({ starIndex }) => starIndex)).toEqual([0]);
  });

  it('falls back to a visible companion', () => {
    const anchors = systemAnchors([system], index, Uint8Array.of(0, 1));
    expect(anchors.map(({ starIndex }) => starIndex)).toEqual([1]);
  });

  it('leaves out a system with nothing visible', () => {
    expect(systemAnchors([system], index, Uint8Array.of(0, 0))).toEqual([]);
  });
});
