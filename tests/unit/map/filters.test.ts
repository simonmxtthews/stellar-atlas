import { describe, expect, it } from 'vitest';
import {
  computeVisibleMask,
  countVisible,
  DEFAULT_FILTERS,
  revealFilters,
} from '../../../src/lib/filters';
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
  [near.systemId, systemOf(near, { starIds: [near.id, companion.id], planetCount: 0 })],
  [atEdge.systemId, systemOf(atEdge, { planetCount: 2 })],
  [far.systemId, systemOf(far)],
]);

function visibleIds(filters = {}): string[] {
  const mask = computeVisibleMask(stars, systemsById, { ...DEFAULT_FILTERS, ...filters });
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
    const filters = { hiddenClasses: ['G'], hasPlanets: true, multipleOnly: true };
    expect(visibleIds(filters)).toContain('hyg:0');
  });

  it('filters by the planets of the whole system', () => {
    expect(visibleIds({ hasPlanets: true })).toEqual(['hyg:0', 'hyg:2']);
  });

  it('filters to multiple systems', () => {
    expect(visibleIds({ multipleOnly: true })).toEqual(['hyg:0', 'hyg:1', 'hyg:4']);
  });
});

describe('countVisible', () => {
  it('counts visible stars and their distinct systems', () => {
    const mask = computeVisibleMask(stars, systemsById, DEFAULT_FILTERS);
    expect(countVisible(stars, mask)).toEqual({ stars: 4, systems: 3 });
  });
});

describe('computeVisibleMask with tags', () => {
  it('taggedOnly keeps tagged stars and Sol', () => {
    const stars = [starOf({ id: 'hyg:0' }), starOf({ id: 'a' }), starOf({ id: 'b' })];
    const systems = new Map(stars.map((star) => [star.systemId, systemOf(star)]));
    const filters = { ...DEFAULT_FILTERS, taggedOnly: true };
    expect([...computeVisibleMask(stars, systems, filters, new Set(['b']))]).toEqual([1, 0, 1]);
  });
});

describe('revealFilters', () => {
  it('drops taggedOnly for an untagged star, and keeps it for a tagged one', () => {
    const star = starOf({ id: 'a' });
    const filters = { ...DEFAULT_FILTERS, taggedOnly: true };
    expect(revealFilters(star, systemOf(star), filters).taggedOnly).toBe(false);
    expect(revealFilters(star, systemOf(star), filters, true).taggedOnly).toBe(true);
  });

  const far = starOf({ id: 'hyg:9', distLy: 80.2, spectral: { cls: 'M' } });

  it('leaves filters alone when the star already shows', () => {
    const near = starOf({ id: 'hyg:8', distLy: 10 });
    expect(revealFilters(near, systemOf(near), DEFAULT_FILTERS)).toEqual(DEFAULT_FILTERS);
  });

  it('widens the radius, rounding up, and never shrinks it', () => {
    expect(revealFilters(far, systemOf(far), DEFAULT_FILTERS).radiusLy).toBe(81);
    const wide = { ...DEFAULT_FILTERS, radiusLy: 90 };
    expect(revealFilters(far, systemOf(far), wide).radiusLy).toBe(90);
  });

  it('unhides only the class of the star', () => {
    const filters = { ...DEFAULT_FILTERS, hiddenClasses: ['M', 'K'] as const };
    expect(revealFilters(far, systemOf(far), filters).hiddenClasses).toEqual(['K']);
  });

  it('drops only the system filters the star fails', () => {
    const filters = { ...DEFAULT_FILTERS, hasPlanets: true, multipleOnly: true };
    const host = systemOf(far, { planetCount: 2 });
    expect(revealFilters(far, host, filters)).toMatchObject({
      hasPlanets: true,
      multipleOnly: false,
    });
    const binary = systemOf(far, { starIds: ['hyg:9', 'hyg:10'] });
    expect(revealFilters(far, binary, filters)).toMatchObject({
      hasPlanets: false,
      multipleOnly: true,
    });
  });

  it('never changes filters for Sol, which always shows', () => {
    const filters = { ...DEFAULT_FILTERS, hiddenClasses: ['G'] as const, hasPlanets: true };
    expect(revealFilters(sol, systemOf(sol), filters)).toBe(filters);
  });
});
