import { describe, expect, it } from 'vitest';
import {
  countExoplanets,
  isPotentiallyHabitable,
  planetKind,
  planetTraitsBySystem,
} from '../../../src/lib/exoplanets';
import type { Planet } from '../../../src/types/catalogue';
import { sol, starOf } from './fixtures';

function planetOf(
  id: string,
  radiusEarth?: number,
  massEarth?: number,
  inHabitableZone?: boolean,
): Planet {
  return {
    id,
    name: id,
    letter: 'b',
    hostStarId: 'hyg:1',
    discoveryMethod: 'Transit',
    ...(radiusEarth !== undefined && { radiusEarth }),
    ...(massEarth !== undefined && { massEarth }),
    ...(inHabitableZone !== undefined && { inHabitableZone }),
  };
}

describe('planetKind', () => {
  it('splits rocky from gas at 1.6 Earth radii', () => {
    expect(planetKind(planetOf('a', 1))).toBe('rocky');
    expect(planetKind(planetOf('b', 1.6))).toBe('rocky');
    expect(planetKind(planetOf('c', 1.61))).toBe('gas');
    expect(planetKind(planetOf('d', 12))).toBe('gas');
  });

  it('does not guess from mass alone', () => {
    expect(planetKind(planetOf('a', undefined, 1189))).toBe('unknown');
  });
});

describe('isPotentiallyHabitable', () => {
  it('takes rocky planets in the habitable zone', () => {
    expect(isPotentiallyHabitable(planetOf('a', 1, undefined, true))).toBe(true);
    expect(isPotentiallyHabitable(planetOf('b', 1, undefined, false))).toBe(false);
    expect(isPotentiallyHabitable(planetOf('c', 1))).toBe(false);
    expect(isPotentiallyHabitable(planetOf('d', 12, undefined, true))).toBe(false);
    expect(isPotentiallyHabitable(planetOf('e', undefined, 1, true))).toBe(false);
  });
});

describe('countExoplanets', () => {
  const planets = [
    planetOf('rocky', 1),
    planetOf('gas', 11),
    planetOf('gas2', 4),
    planetOf('unmeasured'),
    planetOf('earth', 1),
  ];
  const planetsById = new Map(planets.map((planet) => [planet.id, planet]));
  const host = starOf({ id: 'hyg:1', planetIds: ['rocky', 'gas', 'missing'] });
  const other = starOf({ id: 'hyg:2', planetIds: ['gas2', 'unmeasured'] });
  const bare = starOf({ id: 'hyg:3' });

  it('counts every planet of the given stars by kind', () => {
    expect(countExoplanets([host, other, bare], planetsById)).toEqual({
      total: 4,
      rocky: 1,
      gas: 2,
      unknown: 1,
    });
    expect(countExoplanets([bare], planetsById).total).toBe(0);
  });

  it("leaves out the Sun's planets", () => {
    const sun = { ...sol, planetIds: ['earth'] };
    expect(countExoplanets([sun, host], planetsById).total).toBe(2);
  });
});

describe('planetTraitsBySystem', () => {
  it('pools the planets of all the stars in a system', () => {
    const planets = [
      planetOf('rocky', 1),
      planetOf('gas', 11, undefined, true),
      planetOf('unmeasured'),
    ];
    const a = starOf({ id: 'a', systemId: 'sys', planetIds: ['rocky'] });
    const b = starOf({ id: 'b', systemId: 'sys', planetIds: ['gas'] });
    const lone = starOf({ id: 'c', systemId: 'lone', planetIds: ['unmeasured', 'missing'] });
    const bare = starOf({ id: 'd', systemId: 'bare' });
    const kinds = planetTraitsBySystem(
      [a, b, lone, bare],
      new Map(planets.map((planet) => [planet.id, planet])),
    );
    expect(kinds.get('sys')).toEqual(new Set(['rocky', 'gas']));
    const temperate = planetOf('temperate', 1.2, undefined, true);
    const host = starOf({ id: 'e', systemId: 'hz', planetIds: ['temperate'] });
    expect(planetTraitsBySystem([host], new Map([[temperate.id, temperate]])).get('hz')).toEqual(
      new Set(['rocky', 'habitable']),
    );
    expect(kinds.get('lone')).toEqual(new Set(['unknown']));
    expect(kinds.has('bare')).toBe(false);
  });
});
