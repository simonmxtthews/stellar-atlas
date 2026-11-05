// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aliasTerms, createStarSearch, normaliseWords, searchStars } from '../../../src/lib/search';
import type { Star, StarSystem } from '../../../src/types/catalogue';
import { starOf, systemOf } from '../map/fixtures';

function read<T>(file: string): T {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../public/data', file), 'utf8'),
  );
}

function catalogueOf(stars: readonly Star[], systems: readonly StarSystem[]) {
  return {
    stars,
    starsById: new Map(stars.map((star) => [star.id, star])),
    systemsById: new Map(systems.map((system) => [system.id, system])),
  };
}

const real = createStarSearch(
  catalogueOf(read<Star[]>('stars.json'), read<StarSystem[]>('systems.json')),
);
const names = (query: string) => searchStars(real, query).map((star) => star.displayName);
const top = (query: string) => names(query)[0];

describe('normaliseWords', () => {
  it.each([
    ['α Cen', ['alpha', 'cen']],
    ['α¹ Cen', ['alpha1', 'cen']],
    ['alpha-1 cen', ['alpha1', 'cen']],
    ['Alpha 1 Cen', ['alpha1', 'cen']],
    ['τ Boötis', ['tau', 'bootis']],
    ['GJ 699', ['gj699']],
    ['Gliese 699', ['gj699']],
    ['gl699', ['gj699']],
    ['GJ  559 A', ['gj559a']],
    ['gl 559a', ['gj559a']],
    ['GJ 508.1', ['gj508.1']],
    ['HD 10700', ['hd10700']],
    ['hip-8102', ['hip8102']],
    ["Barnard's Star", ['barnards', 'star']],
    ['  ', []],
  ])('%s', (query, expected) => {
    expect(normaliseWords(query)).toEqual(expected);
  });
});

describe('aliasTerms', () => {
  it('spells a Bayer name every way', () => {
    expect(aliasTerms('Alpha-1 Centauri')).toEqual(
      expect.arrayContaining(['alpha', 'alp', 'alf', 'alpha1', 'alp1', 'cen', 'centaurus']),
    );
  });

  it('expands two-word constellations', () => {
    expect(aliasTerms('Alpha Canis Majoris')).toEqual(
      expect.arrayContaining(['cma', 'canis', 'majoris', 'major']),
    );
    expect(aliasTerms('Alpha CMa')).toEqual(expect.arrayContaining(['canis', 'majoris']));
  });

  it('takes a leading Tau as the letter, not Taurus', () => {
    expect(aliasTerms('tau Cet')).not.toContain('taurus');
    expect(aliasTerms('Alpha Tau')).toContain('taurus');
  });

  it('finds catalogue IDs under any Gliese prefix or none', () => {
    expect(aliasTerms('GJ 559 A')).toEqual(
      expect.arrayContaining(['gj', 'gl', 'gliese', 'gj559', 'gj559a', '559', '559a']),
    );
  });

  it('joins a name to its number', () => {
    expect(aliasTerms('Ross 128')).toContain('ross128');
  });
});

describe('search over the real catalogue', () => {
  it.each([
    ['Greek letters', ['α Cen', 'alpha cen', 'alp cen', 'alf cen'], 'Rigil Kentaurus'],
    ['constellation forms', ['alpha centauri', 'alpha centaurus', 'α Cen'], 'Rigil Kentaurus'],
    ['numbered Bayer', ['α1 Cen', 'alpha-1 centauri', 'alpha 1 cen'], 'Rigil Kentaurus'],
    ['Gliese prefixes', ['GJ 699', 'Gliese 699', 'gl699', 'gj699', '699'], "Barnard's Star"],
    ['HD prefixes', ['HD 10700', 'hd10700', '10700'], 'Tau Ceti'],
    ['HIP and HR', ['HIP 8102', 'hip8102', 'hr 509'], 'Tau Ceti'],
    ['two-word constellations', ['alpha cma', 'α CMa', 'alp canis major'], 'Sirius'],
    ['the Greek Tau', ['tau ceti', 'tau cet', 'τ Cet'], 'Tau Ceti'],
    ['Tau the constellation', ['alpha tau', 'alpha taurus', 'alpha tauri'], 'Aldebaran'],
    ['diacritics', ['tau bootis', 'tau boötis', 'tau boo'], 'Tau Boötis'],
    ['joined names', ['ross128', 'ross 128'], 'Ross 128'],
    ['apostrophes', ["barnard's star", 'barnards star', 'barnard'], "Barnard's Star"],
    ['a typo', ['sirus'], 'Sirius'],
    ['the Sun', ['sun', 'sol'], 'Sol'],
  ])('%s', (_label, queries, expected) => {
    for (const query of queries) expect(top(query), query).toBe(expected);
  });

  it('reads component letters', () => {
    expect(names('GJ 559 A')).toEqual(['Rigil Kentaurus']);
    expect(names('gj 559')).toHaveLength(2);
    expect(names('sirius b')).toEqual(['GJ 244 B']);
  });

  it('never matches a catalogue number fuzzily', () => {
    expect(names('GJ 69999')).toEqual([]);
  });

  it('completes a partly typed name', () => {
    expect(top('alpha cent')).toBe('Rigil Kentaurus');
    expect(top('prox')).toBe('Proxima Centauri');
  });

  it('ranks equal matches nearest first, so a broad query finds the neighbours', () => {
    expect(top('alpha')).toBe('Rigil Kentaurus');
    expect(top('tau')).toBe('Tau Ceti');
  });

  it('caps results at 10', () => {
    expect(names('gj')).toHaveLength(10);
  });

  it('returns nothing for blank or unmatched queries', () => {
    expect(names('   ')).toEqual([]);
    expect(names('.')).toEqual([]);
    expect(names('zzzzqq')).toEqual([]);
  });
});

describe('searchStars', () => {
  it('puts an exact match ahead of a prefix match', () => {
    const exact = starOf({
      id: 'hyg:1',
      displayName: 'Sample',
      names: { gliese: 'GJ 12', other: [] },
    });
    const longer = starOf({
      id: 'hyg:2',
      displayName: 'GJ 12.1',
      names: { gliese: 'GJ 12.1', other: [] },
    });
    const stars = [longer, exact];
    const search = createStarSearch(
      catalogueOf(
        stars,
        stars.map((star) => systemOf(star)),
      ),
    );
    expect(searchStars(search, 'gj 12').map((star) => star.id)).toEqual(['hyg:1', 'hyg:2']);
  });
});
