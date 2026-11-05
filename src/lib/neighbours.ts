import type { StarSystem } from '../types/catalogue';

export interface Neighbour {
  readonly system: StarSystem;
  readonly distanceLy: number;
}

export function nearestSystems(
  origin: StarSystem,
  systems: readonly StarSystem[],
  count: number,
): readonly Neighbour[] {
  const [x, y, z] = origin.pos;
  return systems
    .filter((system) => system.id !== origin.id)
    .map((system) => ({
      system,
      distanceLy: Math.hypot(system.pos[0] - x, system.pos[1] - y, system.pos[2] - z),
    }))
    .sort((a, b) => a.distanceLy - b.distanceLy)
    .slice(0, count);
}

// Nearest first.
export function systemsWithin(
  origin: StarSystem,
  systems: readonly StarSystem[],
  radiusLy: number,
): readonly Neighbour[] {
  return nearestSystems(origin, systems, systems.length).filter(
    ({ distanceLy }) => distanceLy <= radiusLy,
  );
}
