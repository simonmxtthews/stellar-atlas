import type { StarSystem } from '../types/catalogue';

export interface SystemAnchor {
  readonly system: StarSystem;
  readonly starIndex: number;
}

// Where each visible system is drawn: its first visible star, primary first, so a filtered-out
// primary doesn't hide a companion's ring or label. Systems with no visible star are left out.
export function systemAnchors(
  systems: readonly StarSystem[],
  starIndexById: ReadonlyMap<string, number>,
  mask: Uint8Array,
): readonly SystemAnchor[] {
  return systems.flatMap((system) => {
    for (const starId of system.starIds) {
      const starIndex = starIndexById.get(starId);
      if (starIndex !== undefined && mask[starIndex]) return [{ system, starIndex }];
    }
    return [];
  });
}
