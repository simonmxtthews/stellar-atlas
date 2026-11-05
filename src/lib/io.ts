import { z } from 'zod';
import type { DriveModel, Route, StarMeta, Tag, World } from '../types/world';
import { ROUTE_KINDS } from '../types/world';

const CURRENT_SCHEMA_VERSION = 1;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour');
const position = z.tuple([z.number(), z.number(), z.number()]);

const driveSchema: z.ZodType<DriveModel> = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('sublight'),
    fractionC: z.number().gt(0).lt(1),
    accelG: z.number().positive().optional(),
  }),
  z.strictObject({ type: z.literal('ftl-speed'), multipleOfC: z.number().positive() }),
  z.strictObject({
    type: z.literal('jump'),
    maxJumpLy: z.number().positive(),
    daysPerJump: z.number().nonnegative(),
  }),
]);

const worldSchema: z.ZodType<World> = z.strictObject({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  name: z.string(),
  drive: driveSchema,
  tags: z.array(z.strictObject({ id: z.string(), label: z.string(), color })),
  starMeta: z.record(
    z.string(),
    z.strictObject({
      tagIds: z.array(z.string()),
      customName: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
  routes: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string().optional(),
      waypoints: z.array(z.string()).min(2),
      kind: z.enum(ROUTE_KINDS),
      color,
      dashed: z.boolean(),
      width: z.number().positive(),
      notes: z.string().optional(),
    }),
  ),
  regions: z.array(
    z.strictObject({ id: z.string(), name: z.string(), color, systemIds: z.array(z.string()) }),
  ),
  view: z.strictObject({ camera: position, target: position }).optional(),
});

export class WorldFileError extends Error {
  override readonly name = 'WorldFileError';
}

// One step per schema version: MIGRATIONS[n] turns a version n world into version n + 1.
const MIGRATIONS: Readonly<Record<number, (world: unknown) => unknown>> = {};

export function migrate(raw: unknown): unknown {
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new WorldFileError('This is not a world file: it has no schemaVersion.');
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new WorldFileError(
      `This world uses schema version ${version}; this app only reads up to ${CURRENT_SCHEMA_VERSION}.`,
    );
  }
  let world = raw;
  for (let from = version; from < CURRENT_SCHEMA_VERSION; from++) {
    const step = MIGRATIONS[from];
    if (!step) throw new WorldFileError(`No migration from schema version ${from}.`);
    world = step(world);
  }
  return world;
}

export function parseWorld(raw: unknown): World {
  const result = worldSchema.safeParse(migrate(raw));
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new WorldFileError(
    `Invalid world file at ${issue?.path.join('.') || 'the top level'}: ${issue?.message}`,
  );
}

export function parseWorldFile(text: string): World {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new WorldFileError('This file is not valid JSON.');
  }
  return parseWorld(raw);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}

// Pretty-printed with sorted keys, for clean diffs when the file lives in git.
export function serialiseWorld(world: World): string {
  return `${JSON.stringify(sortKeys(world), null, 2)}\n`;
}

export function worldFileName(prefix: string, extension: string, world: World, date: Date): string {
  const slug = world.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${prefix}-${slug || 'untitled'}-${date.toISOString().slice(0, 10)}.${extension}`;
}

export function exportFileName(world: World, date: Date): string {
  return worldFileName('world', 'json', world, date);
}

function mergeMeta(ours: StarMeta | undefined, theirs: StarMeta): StarMeta {
  if (!ours) return theirs;
  return {
    ...theirs,
    ...ours,
    tagIds: [...new Set([...ours.tagIds, ...theirs.tagIds])],
  };
}

function missingFrom<T extends { readonly id: string }>(
  ours: readonly T[],
  theirs: readonly T[],
): readonly T[] {
  const ids = new Set(ours.map((item) => item.id));
  return theirs.filter((item) => !ids.has(item.id));
}

// Adds what the incoming world has and this one lacks. Whatever both have, this world's version
// stays; its name and drive model too.
export function mergeWorlds(ours: World, theirs: World): World {
  const starMeta: Record<string, StarMeta> = { ...ours.starMeta };
  for (const [starId, meta] of Object.entries(theirs.starMeta)) {
    starMeta[starId] = mergeMeta(ours.starMeta[starId], meta);
  }
  return {
    ...ours,
    tags: [...ours.tags, ...missingFrom<Tag>(ours.tags, theirs.tags)],
    routes: [...ours.routes, ...missingFrom<Route>(ours.routes, theirs.routes)],
    regions: [...ours.regions, ...missingFrom(ours.regions, theirs.regions)],
    starMeta,
  };
}

// Follows meta.json's idMap, for IDs a catalogue rebuild changed. The same world when none did.
export function remapWorldIds(world: World, idMap: Readonly<Record<string, string>>): World {
  const mapped = (id: string) => idMap[id] ?? id;
  const affected =
    Object.keys(world.starMeta).some((id) => idMap[id]) ||
    world.routes.some((route) => route.waypoints.some((id) => idMap[id])) ||
    world.regions.some((region) => region.systemIds.some((id) => idMap[id]));
  if (!affected) return world;

  const starMeta: Record<string, StarMeta> = {};
  for (const [starId, meta] of Object.entries(world.starMeta)) {
    const id = mapped(starId);
    starMeta[id] = mergeMeta(starMeta[id], meta);
  }
  return {
    ...world,
    starMeta,
    routes: world.routes.map((route) => ({ ...route, waypoints: route.waypoints.map(mapped) })),
    regions: world.regions.map((region) => ({
      ...region,
      systemIds: region.systemIds.map(mapped),
    })),
  };
}

// IDs the catalogue doesn't have. They are kept in the world, and reported rather than fatal.
export function unknownIds(
  world: World,
  starIds: ReadonlyMap<string, unknown>,
  systemIds: ReadonlyMap<string, unknown>,
): readonly string[] {
  const unknown = new Set<string>();
  for (const id of Object.keys(world.starMeta)) if (!starIds.has(id)) unknown.add(id);
  for (const { waypoints } of world.routes) {
    for (const id of waypoints) if (!systemIds.has(id)) unknown.add(id);
  }
  for (const { systemIds: members } of world.regions) {
    for (const id of members) if (!systemIds.has(id)) unknown.add(id);
  }
  return [...unknown].sort();
}
