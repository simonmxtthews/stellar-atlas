import { describe, expect, it } from 'vitest';
import {
  computeVisibleMask,
  countVisible,
  DEFAULT_FILTERS,
  distanceFromReference,
  revealFilters,
  matchesPlanetFilter,
  type PlanetFilter,
} from '../../../src/lib/filters';
import type { PlanetTrait } from '../../../src/lib/exoplanets';
import { sol, starOf, systemOf } from './fixtures';

const near = starOf({ id: 'hyg:1', distLy: 10, spectral: { cls: 'M' } });
const atEdge = starOf({ id: 'hyg:2', distLy: 50, spectral: { cls: 'K' } });
const far = starOf({ id: 'hyg:3', distLy: 50.01, spectral: { cls: 'K' } });
const companion = starOf({
  id: 'hyg:4',
  distLy: 10,
  systemId: near.systemId,
  spectral: { cls: 'D' },
});
const stars = [sol, near, atEdge, far, companion];
const systemsById = new Map([
  [sol.systemId, systemOf(sol)],
  [near.systemId, systemOf(near, { starIds: [near.id, companion.id] })],
  [atEdge.systemId, systemOf(atEdge)],
  [far.systemId, systemOf(far)],
]);
const noTraits: ReadonlyMap<string, ReadonlySet<PlanetTrait>> = new Map();
const traitsBySystem = new Map([[atEdge.systemId, new Set<PlanetTrait>(['rocky'])]]);

function visibleIds(filters = {}): string[] {
  const mask = computeVisibleMask(stars, systemsById, traitsBySystem, {
    ...DEFAULT_FILTERS,
    ...filters,
  });
  return stars.filter((_, i) => mask[i]).map((star) => star.id);
}

describe('computeVisibleMask', () => {
  it('keeps stars within the radius, inclusive', () => {
    expect(visibleIds()).toEqual(['hyg:0', 'hyg:1', 'hyg:2', 'hyg:4']);
    expect(visibleIds({ radiusLy: 100 })).toContain('hyg:3');
    expect(visibleIds({ radiusLy: 5 })).toEqual(['hyg:0']);
  });

  it('hides stars of a hidden class', () => {
    expect(visibleIds({ hiddenClasses: ['M', 'D'] })).toEqual(['hyg:0', 'hyg:2']);
  });

  it('keeps Sol whatever the filters say', () => {
    const filters = { hiddenClasses: ['G'], planets: 'both', multipleOnly: true };
    expect(visibleIds(filters)).toContain('hyg:0');
  });

  it('filters by the planets of the whole system', () => {
    expect(visibleIds({ planets: 'any' })).toEqual(['hyg:0', 'hyg:2']);
    expect(visibleIds({ planets: 'rocky' })).toEqual(['hyg:0', 'hyg:2']);
    expect(visibleIds({ planets: 'gas' })).toEqual(['hyg:0']);
    expect(visibleIds({ planets: 'none' })).toEqual(['hyg:0', 'hyg:1', 'hyg:4']);
  });

  it('filters to multiple systems', () => {
    expect(visibleIds({ multipleOnly: true })).toEqual(['hyg:0', 'hyg:1', 'hyg:4']);
  });
});

describe('matchesPlanetFilter', () => {
  it.each<[string, PlanetTrait[], PlanetFilter[]]>([
    ['no planets', [], ['all', 'none']],
    ['only rocky', ['rocky'], ['all', 'any', 'rocky']],
    ['habitable', ['rocky', 'habitable'], ['all', 'any', 'rocky', 'habitable']],
    ['only gas', ['gas'], ['all', 'any', 'gas']],
    ['both', ['rocky', 'gas'], ['all', 'any', 'rocky', 'gas', 'both']],
    ['only unclassified', ['unknown'], ['all', 'any']],
  ])('%s', (_, kinds, matching) => {
    const filters: PlanetFilter[] = ['all', 'any', 'rocky', 'gas', 'both', 'habitable', 'none'];
    expect(filters.filter((filter) => matchesPlanetFilter(new Set(kinds), filter))).toEqual(
      matching,
    );
  });
});

describe('countVisible', () => {
  it('counts visible stars and their distinct systems', () => {
    const mask = computeVisibleMask(stars, systemsById, noTraits, DEFAULT_FILTERS);
    expect(countVisible(stars, mask)).toEqual({ stars: 4, systems: 3 });
  });
});

describe('computeVisibleMask with tags', () => {
  it('taggedOnly keeps tagged stars and Sol', () => {
    const stars = [starOf({ id: 'hyg:0' }), starOf({ id: 'a' }), starOf({ id: 'b' })];
    const systems = new Map(stars.map((star) => [star.systemId, systemOf(star)]));
    const filters = { ...DEFAULT_FILTERS, taggedOnly: true };
    expect([...computeVisibleMask(stars, systems, noTraits, filters, new Set(['b']))]).toEqual([
      1, 0, 1,
    ]);
  });
});

describe('revealFilters', () => {
  it('drops taggedOnly for an untagged star, and keeps it for a tagged one', () => {
    const star = starOf({ id: 'a' });
    const filters = { ...DEFAULT_FILTERS, taggedOnly: true };
    expect(revealFilters(star, systemOf(star), undefined, filters).taggedOnly).toBe(false);
    expect(revealFilters(star, systemOf(star), undefined, filters, true).taggedOnly).toBe(true);
  });

  const far = starOf({ id: 'hyg:9', distLy: 80.2, spectral: { cls: 'M' } });

  it('leaves filters alone when the star already shows', () => {
    const near = starOf({ id: 'hyg:8', distLy: 10 });
    expect(revealFilters(near, systemOf(near), undefined, DEFAULT_FILTERS)).toEqual(
      DEFAULT_FILTERS,
    );
  });

  it('widens the radius, rounding up, and never shrinks it', () => {
    expect(revealFilters(far, systemOf(far), undefined, DEFAULT_FILTERS).radiusLy).toBe(81);
    const wide = { ...DEFAULT_FILTERS, radiusLy: 90 };
    expect(revealFilters(far, systemOf(far), undefined, wide).radiusLy).toBe(90);
  });

  it('unhides only the class of the star', () => {
    const filters = { ...DEFAULT_FILTERS, hiddenClasses: ['M', 'K'] as const };
    expect(revealFilters(far, systemOf(far), undefined, filters).hiddenClasses).toEqual(['K']);
  });

  it('drops only the system filters the star fails', () => {
    const filters = { ...DEFAULT_FILTERS, planets: 'rocky' as const, multipleOnly: true };
    const host = systemOf(far);
    expect(revealFilters(far, host, new Set(['rocky', 'gas']), filters)).toMatchObject({
      planets: 'rocky',
      multipleOnly: false,
    });
    const binary = systemOf(far, { starIds: ['hyg:9', 'hyg:10'] });
    expect(revealFilters(far, binary, undefined, filters)).toMatchObject({
      planets: 'all',
      multipleOnly: true,
    });
  });

  it('never changes filters for Sol, which always shows', () => {
    const filters = { ...DEFAULT_FILTERS, hiddenClasses: ['G'] as const, planets: 'both' as const };
    expect(revealFilters(sol, systemOf(sol), undefined, filters)).toBe(filters);
  });
});

describe('reference star', () => {
  const near = starOf({ id: 'near', pos: [30, 0, 0], distLy: 30 });
  const far = starOf({ id: 'far', pos: [70, 0, 0], distLy: 70 });
  const stars = [sol, near, far];
  const byId = new Map(stars.map((star) => [star.systemId, systemOf(star)]));
  const filters = { ...DEFAULT_FILTERS, radiusLy: 30 };

  it('measures from Sol by default, by the catalogue distance', () => {
    expect(distanceFromReference(near, undefined)).toBe(30);
    expect(distanceFromReference(near, sol)).toBe(30);
  });

  it('measures from the reference otherwise', () => {
    expect(distanceFromReference(far, near)).toBeCloseTo(40);
  });

  it('centres the radius on the reference, keeping Sol as the landmark', () => {
    expect([...computeVisibleMask(stars, byId, noTraits, filters)]).toEqual([1, 1, 0]);
    expect([...computeVisibleMask(stars, byId, noTraits, filters, new Set(), far)]).toEqual([
      1, 0, 1,
    ]);
    expect([
      ...computeVisibleMask(stars, byId, noTraits, { ...filters, radiusLy: 5 }, new Set(), far),
    ]).toEqual([1, 0, 1]);
  });

  it('widens to reveal a star by its distance from the reference', () => {
    const revealed = revealFilters(
      far,
      systemOf(far),
      undefined,
      { ...filters, radiusLy: 5 },
      false,
      near,
    );
    expect(revealed.radiusLy).toBe(40);
  });
});
