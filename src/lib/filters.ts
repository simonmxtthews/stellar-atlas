import type { SpectralClass, Star, StarSystem } from '../types/catalogue';
import { distanceLy } from './routes';

export const SOL_ID = 'hyg:0';
export const MIN_RADIUS_LY = 5;
export const MAX_RADIUS_LY = 100;

export interface StarFilters {
  readonly radiusLy: number;
  readonly hiddenClasses: readonly SpectralClass[];
  readonly hasPlanets: boolean;
  readonly multipleOnly: boolean;
  readonly taggedOnly: boolean;
}

export const DEFAULT_FILTERS: StarFilters = {
  radiusLy: 50,
  hiddenClasses: [],
  hasPlanets: false,
  multipleOnly: false,
  taggedOnly: false,
};

// Distances in the UI run from the reference star. Sol's use the catalogue's own figure.
export function distanceFromReference(star: Star, reference: Star | undefined): number {
  return !reference || reference.id === SOL_ID ? star.distLy : distanceLy(star.pos, reference.pos);
}

// One entry per star, 1 when visible. Sol stays visible as the map's fixed landmark.
export function computeVisibleMask(
  stars: readonly Star[],
  systemsById: ReadonlyMap<string, StarSystem>,
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
        (!filters.hasPlanets || (system?.planetCount ?? 0) > 0) &&
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
  filters: StarFilters,
  tagged = false,
  reference?: Star,
): StarFilters {
  if (star.id === SOL_ID) return filters;
  return {
    radiusLy: Math.max(filters.radiusLy, Math.ceil(distanceFromReference(star, reference))),
    hiddenClasses: filters.hiddenClasses.filter((cls) => cls !== star.spectral.cls),
    hasPlanets: filters.hasPlanets && system.planetCount > 0,
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
