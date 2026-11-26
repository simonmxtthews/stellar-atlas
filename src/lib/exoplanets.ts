import type { Planet, Star } from '../types/catalogue';
import { SOL_ID } from './filters';

// Most planets larger than this hold on to a thick gas envelope (Rogers 2015).
export const MAX_ROCKY_RADIUS_EARTH = 1.6;

export type PlanetKind = 'rocky' | 'gas' | 'unknown';

// By radius alone. The archive's masses without a radius can't stand in for one: they put known
// super-Earths, such as HD 40307 b, at several Jupiters.
export function planetKind({ radiusEarth }: Planet): PlanetKind {
  if (radiusEarth === undefined) return 'unknown';
  return radiusEarth <= MAX_ROCKY_RADIUS_EARTH ? 'rocky' : 'gas';
}

// What the exoplanet filter goes by: each planet's kind, and whether it might be habitable.
export type PlanetTrait = PlanetKind | 'habitable';

// Rocky, and orbiting within its star's conservative habitable zone, where liquid water could last
// on the surface.
export function isPotentiallyHabitable(planet: Planet): boolean {
  return planetKind(planet) === 'rocky' && planet.inHabitableZone === true;
}

export interface ExoplanetCounts extends Readonly<Record<PlanetKind, number>> {
  readonly total: number;
}

// The planets of these stars, leaving out the Sun's, which aren't exoplanets.
export function countExoplanets(
  stars: readonly Star[],
  planetsById: ReadonlyMap<string, Planet>,
): ExoplanetCounts {
  const counts = { total: 0, rocky: 0, gas: 0, unknown: 0 };
  for (const star of stars) {
    if (star.id === SOL_ID) continue;
    for (const id of star.planetIds) {
      const planet = planetsById.get(id);
      if (!planet) continue;
      counts.total++;
      counts[planetKind(planet)]++;
    }
  }
  return counts;
}

// The traits of the planets in each system, whichever of its stars they orbit. Systems without
// any planets are left out.
export function planetTraitsBySystem(
  stars: readonly Star[],
  planetsById: ReadonlyMap<string, Planet>,
): ReadonlyMap<string, ReadonlySet<PlanetTrait>> {
  const traitsBySystem = new Map<string, Set<PlanetTrait>>();
  for (const star of stars) {
    for (const id of star.planetIds) {
      const planet = planetsById.get(id);
      if (!planet) continue;
      const traits = traitsBySystem.get(star.systemId) ?? new Set();
      traits.add(planetKind(planet));
      if (isPotentiallyHabitable(planet)) traits.add('habitable');
      traitsBySystem.set(star.systemId, traits);
    }
  }
  return traitsBySystem;
}
