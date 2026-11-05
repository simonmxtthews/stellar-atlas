import type { Star, StarSystem } from '../types/catalogue';
import type { Region, Route, StarMeta, Tag } from '../types/world';

type StarMetaById = Readonly<Record<string, StarMeta>>;

export function customNameOf(meta: StarMetaById, starId: string): string | undefined {
  return meta[starId]?.customName?.trim() || undefined;
}

// A system goes by the custom name of its first named star, primary first.
export function systemCustomName(meta: StarMetaById, system: StarSystem): string | undefined {
  for (const starId of system.starIds) {
    const name = customNameOf(meta, starId);
    if (name) return name;
  }
  return undefined;
}

export function withCustomName(realName: string, customName: string | undefined): string {
  return customName ? `${customName} (${realName})` : realName;
}

export function systemLabel(
  meta: StarMetaById,
  systemsById: ReadonlyMap<string, StarSystem>,
  id: string,
): string {
  const system = systemsById.get(id);
  if (!system) return `${id} (not in the catalogue)`;
  return withCustomName(system.name, systemCustomName(meta, system));
}

export function taggedStarIds(meta: StarMetaById): ReadonlySet<string> {
  return new Set(
    Object.entries(meta)
      .filter(([, { tagIds }]) => tagIds.length > 0)
      .map(([starId]) => starId),
  );
}

export function taggedSystemIds(
  meta: StarMetaById,
  starsById: ReadonlyMap<string, Star>,
): ReadonlySet<string> {
  return new Set([...taggedStarIds(meta)].flatMap((id) => starsById.get(id)?.systemId ?? []));
}

export function routeEndpointIds(routes: readonly Route[]): ReadonlySet<string> {
  return new Set(
    routes.flatMap(({ waypoints }) => [waypoints[0] ?? [], waypoints.at(-1) ?? []]).flat(),
  );
}

export interface StarHalo {
  readonly starId: string;
  readonly color: string; // the first tag's
  readonly count: number;
}

// Tag IDs with no matching tag (a hand-edited file, say) don't count.
export function starHalos(meta: StarMetaById, tags: readonly Tag[]): readonly StarHalo[] {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  return Object.entries(meta).flatMap(([starId, { tagIds }]) => {
    const found = tagIds.flatMap((id) => tagsById.get(id) ?? []);
    const first = found[0];
    return first ? [{ starId, color: first.color, count: found.length }] : [];
  });
}

// A system in several regions shows the first of them.
export function regionColors(regions: readonly Region[]): ReadonlyMap<string, string> {
  const colors = new Map<string, string>();
  for (const { color, systemIds } of regions) {
    for (const id of systemIds) if (!colors.has(id)) colors.set(id, color);
  }
  return colors;
}
