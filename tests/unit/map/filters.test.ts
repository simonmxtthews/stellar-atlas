import { describe, expect, it } from 'vitest';
import { computeVisibleMask, countVisible, DEFAULT_FILTERS } from '../../../src/lib/filters';
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
