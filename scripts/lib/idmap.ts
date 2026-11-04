import type { Star, StarSystem } from '../../src/types/catalogue';

function designations(star: Star): readonly string[] {
  const { proper, gliese, hd, hip, other } = star.names;
  return [hip, hd, gliese, proper, ...other].filter((name) => name !== undefined);
}

export interface IdMapInput {
  readonly previousStars: readonly Star[];
  readonly previousSystems: readonly StarSystem[];
  readonly previousIdMap: Readonly<Record<string, string>>;
  readonly stars: readonly Star[];
  readonly systems: readonly StarSystem[];
}

/**
 * Saved worlds reference catalogue IDs, so every ID that disappears in a rebuild maps to its
 * successor. Stars are followed by any shared designation, and systems by their old primary.
 */
export function computeIdMap(input: IdMapInput): Record<string, string> {
  const starIds = new Set(input.stars.map((star) => star.id));
  const systemIds = new Set(input.systems.map((system) => system.id));
  const starByDesignation = new Map<string, Star>();
  for (const star of input.stars) {
    for (const name of designations(star)) {
      if (!starByDesignation.has(name)) starByDesignation.set(name, star);
    }
  }

  const systemIdByStar = new Map(input.stars.map((star) => [star.id, star.systemId]));
  const map: Record<string, string> = {};

  for (const star of input.previousStars) {
    if (starIds.has(star.id)) continue;
    const successor = designations(star)
      .map((name) => starByDesignation.get(name))
      .find((found) => found !== undefined);
    if (successor) map[star.id] = successor.id;
  }

  for (const system of input.previousSystems) {
    if (systemIds.has(system.id)) continue;
    const primaryId = system.starIds[0];
    if (primaryId === undefined) continue;
    const successor = systemIdByStar.get(map[primaryId] ?? primaryId);
    if (successor) map[system.id] = successor;
  }

  // Older entries survive and point at the end of the chain, unless their ID came back.
  for (const [from, to] of Object.entries(input.previousIdMap)) {
    if (starIds.has(from) || systemIds.has(from)) continue;
    const target = map[to] ?? to;
    if (starIds.has(target) || systemIds.has(target)) map[from] = target;
  }

  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
}
