import type { SpectralClass, Star, StarSystem } from '../types/catalogue';
import type { PlanetTrait } from './exoplanets';
import { distanceLy } from './routes';

export const SOL_ID = 'hyg:0';
export const MIN_RADIUS_LY = 5;
export const MAX_RADIUS_LY = 100;

// Which systems to show by their known exoplanets. Rocky and gas each take systems that have the
// other kind as well; any also takes those whose planets have no known kind. Habitable takes those
// with a rocky planet in the habitable zone.
export type PlanetFilter = 'all' | 'any' | 'rocky' | 'gas' | 'both' | 'habitable' | 'none';

export interface StarFilters {
  readonly radiusLy: number;
  readonly hiddenClasses: readonly SpectralClass[];
  readonly planets: PlanetFilter;
  readonly multipleOnly: boolean;
  readonly taggedOnly: boolean;
}

export const DEFAULT_FILTERS: StarFilters = {
  radiusLy: 50,
  hiddenClasses: [],
  planets: 'all',
  multipleOnly: false,
  taggedOnly: false,
};

const NO_TRAITS: ReadonlySet<PlanetTrait> = new Set();

export function matchesPlanetFilter(
  traits: ReadonlySet<PlanetTrait> | undefined = NO_TRAITS,
  filter: PlanetFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'any':
      return traits.size > 0;
    case 'rocky':
    case 'gas':
    case 'habitable':
      return traits.has(filter);
    case 'both':
      return traits.has('rocky') && traits.has('gas');
    case 'none':
      return traits.size === 0;
  }
}

// Distances in the UI run from the reference star. Sol's use the catalogue's own figure.
export function distanceFromReference(star: Star, reference: Star | undefined): number {
  return !reference || reference.id === SOL_ID ? star.distLy : distanceLy(star.pos, reference.pos);
}

// One entry per star, 1 when visible. Sol stays visible as the map's fixed landmark.
export function computeVisibleMask(
  stars: readonly Star[],
  systemsById: ReadonlyMap<string, StarSystem>,
  traitsBySystem: ReadonlyMap<string, ReadonlySet<PlanetTrait>>,
  filters: StarFilters,
  taggedStarIds: ReadonlySet<string> = new Set(),
  reference?: Star,
): Uint8Array {
  const hidden = new Set(filters.hiddenClasses);
  const mask = new Uint8Array(stars.length);
  stars.forEach((star, i) => {
    const system = systemsById.get(star.systemId);
    const visible =
      star.id === SOL_ID ||
      (distanceFromReference(star, reference) <= filters.radiusLy &&
        !hidden.has(star.spectral.cls) &&
        matchesPlanetFilter(traitsBySystem.get(star.systemId), filters.planets) &&
        (!filters.multipleOnly || (system?.starIds.length ?? 0) > 1) &&
        (!filters.taggedOnly || taggedStarIds.has(star.id)));
    mask[i] = visible ? 1 : 0;
  });
  return mask;
}

// The least relaxed filters that show this star, so a search hit is never left invisible.
export function revealFilters(
  star: Star,
  system: StarSystem,
  traits: ReadonlySet<PlanetTrait> | undefined,
  filters: StarFilters,
  tagged = false,
  reference?: Star,
): StarFilters {
  if (star.id === SOL_ID) return filters;
  return {
    radiusLy: Math.max(filters.radiusLy, Math.ceil(distanceFromReference(star, reference))),
    hiddenClasses: filters.hiddenClasses.filter((cls) => cls !== star.spectral.cls),
    planets: matchesPlanetFilter(traits, filters.planets) ? filters.planets : 'all',
    multipleOnly: filters.multipleOnly && system.starIds.length > 1,
    taggedOnly: filters.taggedOnly && tagged,
  };
}

export function countVisible(
  stars: readonly Star[],
  mask: Uint8Array,
): { readonly stars: number; readonly systems: number } {
  const systems = new Set<string>();
  let count = 0;
  stars.forEach((star, i) => {
    if (mask[i]) {
      count++;
      systems.add(star.systemId);
    }
  });
  return { stars: count, systems: systems.size };
}
