// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  formatBayer,
  formatFlamsteed,
  formatGliese,
  parseGliese,
  pickDisplayName,
  slugify,
  systemNameFromPrimary,
} from '../../../scripts/lib/names';

describe('catalogue names', () => {
  it('spells out Bayer designations', () => {
    expect(formatBayer('Tau', 'Cet')).toBe('Tau Ceti');
    expect(formatBayer('Alp-1', 'Cen')).toBe('Alpha-1 Centauri');
    expect(formatBayer('Nope', 'Cen')).toBeUndefined();
  });

  it('spells out Flamsteed designations', () => {
    expect(formatFlamsteed('61', 'Cyg')).toBe('61 Cygni');
  });

  it('reads every spelling of a Gliese designation as one key', () => {
    const expected = { base: 'gj15', suffix: 'a' };
    expect(parseGliese('Gl  15A')).toEqual(expected);
    expect(parseGliese('GJ 15 A')).toEqual(expected);
    expect(parseGliese('Gliese 15 A')).toEqual(expected);
    expect(parseGliese('Gl 57.1')).toEqual({ base: 'gj57.1', suffix: '' });
    expect(parseGliese('Wolf 359')).toBeUndefined();
  });

  it('formats Gliese names consistently', () => {
    expect(formatGliese('Gl  57.1')).toBe('GJ 57.1');
    expect(formatGliese('Gl 559A')).toBe('GJ 559 A');
  });

  it('picks the best available display name', () => {
    expect(pickDisplayName({ proper: 'Vega', hip: 'HIP 1', other: [] }, 'x')).toBe('Vega');
    expect(pickDisplayName({ gliese: 'GJ 1', hd: 'HD 1', other: [] }, 'x')).toBe('GJ 1');
    expect(pickDisplayName({ other: ['TOI-270'] }, 'x')).toBe('TOI-270');
    expect(pickDisplayName({ other: [] }, 'hyg:1')).toBe('hyg:1');
  });

  it('slugifies names into stable IDs', () => {
    expect(slugify("Teegarden's Star")).toBe('teegardens-star');
    expect(slugify('WISEP J121756.91+162640.2 A')).toBe('wisep-j121756-91-162640-2-a');
  });
});

describe('systemNameFromPrimary', () => {
  it('prefers a numbered Bayer name over a proper name', () => {
    const names = { proper: 'Rigil Kentaurus', bayer: 'Alpha-1 Centauri', other: [] };
    expect(systemNameFromPrimary(names, 'Rigil Kentaurus')).toBe('Alpha Centauri');
  });

  it('keeps a proper name over an unnumbered Bayer name', () => {
    const names = { proper: 'Sirius', bayer: 'Alpha Canis Majoris', other: [] };
    expect(systemNameFromPrimary(names, 'Sirius')).toBe('Sirius');
  });

  it('drops the component letter', () => {
    expect(systemNameFromPrimary({ other: [] }, 'GJ 65 A')).toBe('GJ 65');
    expect(systemNameFromPrimary({ other: [] }, 'Luyten 726-8 A')).toBe('Luyten 726-8');
  });
});
