import { z } from 'zod';
import type { CatalogueMeta, Planet, ProbeData, Star, StarSystem } from '../../src/types/catalogue';

const position = z.tuple([z.number(), z.number(), z.number()]).readonly();
const stringList = z.array(z.string().min(1)).readonly();

export const starSchema = z.strictObject({
  id: z.string().regex(/^(hyg|ovr|exo):.+/),
  systemId: z.string().min(1),
  names: z.strictObject({
    proper: z.string().min(1).optional(),
    bayer: z.string().min(1).optional(),
    flamsteed: z.string().min(1).optional(),
    gliese: z.string().min(1).optional(),
    hd: z.string().min(1).optional(),
    hip: z.string().min(1).optional(),
    hr: z.string().min(1).optional(),
    other: stringList,
  }),
  displayName: z.string().min(1),
  pos: position,
  distLy: z.number().min(0).max(100),
  mag: z.number().optional(),
  absMag: z.number().optional(),
  spectral: z.strictObject({
    raw: z.string().min(1).optional(),
    cls: z.enum(['O', 'B', 'A', 'F', 'G', 'K', 'M', 'L', 'T', 'Y', 'D', 'unknown']),
    sub: z.number().min(0).optional(),
    lumClass: z.string().min(1).optional(),
  }),
  tempK: z.number().positive().optional(),
  lumSolar: z.number().positive().optional(),
  massSolar: z.number().positive().optional(),
  massEstimated: z.boolean(),
  hzAu: z.tuple([z.number().positive(), z.number().positive()]).readonly().optional(),
  colorHex: z.string().regex(/^#[0-9a-f]{6}$/),
  isPrimary: z.boolean(),
  planetIds: stringList,
  source: z.enum(['hyg', 'exoplanet-archive', 'override']),
}) satisfies z.ZodType<Star>;

export const systemSchema = z.strictObject({
  id: z.string().regex(/^sys:.+/),
  name: z.string().min(1),
  starIds: stringList.refine((ids) => ids.length > 0, 'a system needs at least one star'),
  pos: position,
  distLy: z.number().min(0).max(100),
  planetCount: z.number().int().min(0),
}) satisfies z.ZodType<StarSystem>;

export const planetSchema = z.strictObject({
  id: z.string().regex(/^pl:.+/),
  name: z.string().min(1),
  letter: z.string().min(1),
  hostStarId: z.string().min(1),
  periodDays: z.number().positive().optional(),
  semiMajorAu: z.number().positive().optional(),
  eccentricity: z.number().min(0).optional(),
  radiusEarth: z.number().positive().optional(),
  massEarth: z.number().positive().optional(),
  eqTempK: z.number().positive().optional(),
  insolEarth: z.number().min(0).optional(),
  discoveryMethod: z.string().min(1),
  discoveryYear: z.number().int(),
  inHabitableZone: z.boolean().optional(),
}) satisfies z.ZodType<Planet>;

export const metaSchema = z.strictObject({
  buildDate: z.iso.datetime(),
  radiusLy: z.number().positive(),
  sources: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        version: z.string().min(1),
        url: z.url(),
        licence: z.string().min(1),
        sha256: z.string().optional(),
        fetchedAt: z.iso.datetime(),
      }),
    )
    .readonly(),
  counts: z.strictObject({
    stars: z.number().int().min(0),
    systems: z.number().int().min(0),
    planets: z.number().int().min(0),
  }),
  unmatchedHosts: z
    .array(z.strictObject({ hostname: z.string().min(1), distLy: z.number().min(0) }))
    .readonly(),
  attribution: z.string().min(1),
  idMap: z.record(z.string(), z.string()).readonly(),
}) satisfies z.ZodType<CatalogueMeta>;

export const probeDataSchema = z.strictObject({
  epochYear: z.number(),
  probes: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        name: z.string().min(1),
        pos: position,
        velLyPerYear: position,
        speedKmS: z.number().positive(),
      }),
    )
    .length(5)
    .readonly(),
  pulsars: z
    .array(
      z.strictObject({
        id: z.string().regex(/^B\d{4}[+-]\d{2}$/),
        jName: z.string().regex(/^J\d{4}[+-]\d{4}$/),
        direction: position,
        plaquePeriodS: z.number().positive(),
      }),
    )
    .length(14)
    .readonly(),
}) satisfies z.ZodType<ProbeData>;

export interface Catalogue {
  readonly stars: readonly Star[];
  readonly systems: readonly StarSystem[];
  readonly planets: readonly Planet[];
  readonly meta: CatalogueMeta;
}

function assertUnique(kind: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${kind} id: ${id}`);
    seen.add(id);
  }
}

/** Schema validation plus the cross-file references a per-record schema can't see. */
export function validateCatalogue(catalogue: Catalogue): Catalogue {
  const stars = z.array(starSchema).parse(catalogue.stars);
  const systems = z.array(systemSchema).parse(catalogue.systems);
  const planets = z.array(planetSchema).parse(catalogue.planets);
  const meta = metaSchema.parse(catalogue.meta);

  assertUnique(
    'star',
    stars.map((star) => star.id),
  );
  assertUnique(
    'system',
    systems.map((system) => system.id),
  );
  assertUnique(
    'planet',
    planets.map((planet) => planet.id),
  );

  const starIds = new Set(stars.map((star) => star.id));
  const systemIds = new Set(systems.map((system) => system.id));
  const planetIds = new Set(planets.map((planet) => planet.id));
  const problems: string[] = [];

  for (const star of stars) {
    if (!systemIds.has(star.systemId)) problems.push(`${star.id}: unknown system ${star.systemId}`);
    for (const id of star.planetIds) {
      if (!planetIds.has(id)) problems.push(`${star.id}: unknown planet ${id}`);
    }
  }
  for (const system of systems) {
    for (const id of system.starIds) {
      if (!starIds.has(id)) problems.push(`${system.id}: unknown star ${id}`);
    }
  }
  for (const planet of planets) {
    if (!starIds.has(planet.hostStarId)) {
      problems.push(`${planet.id}: unknown host ${planet.hostStarId}`);
    }
  }
  if (problems.length > 0) throw new Error(`Broken references:\n${problems.join('\n')}`);

  return { stars, systems, planets, meta };
}

export const hygRowSchema = z.object({
  id: z.string().min(1),
  hip: z.string(),
  hd: z.string(),
  hr: z.string(),
  gl: z.string(),
  proper: z.string(),
  ra: z.string().min(1),
  dec: z.string().min(1),
  dist: z.string().min(1),
  pmra: z.string(),
  pmdec: z.string(),
  mag: z.string(),
  absmag: z.string(),
  spect: z.string(),
  ci: z.string(),
  x: z.string().min(1),
  y: z.string().min(1),
  z: z.string().min(1),
  bayer: z.string(),
  flam: z.string(),
  con: z.string(),
  comp_primary: z.string(),
  base: z.string(),
  var: z.string(),
});
export type HygRow = z.infer<typeof hygRowSchema>;

export const exoplanetRowSchema = z.object({
  pl_name: z.string().min(1),
  pl_letter: z.string().min(1),
  hostname: z.string().min(1),
  hd_name: z.string(),
  hip_name: z.string(),
  ra: z.string().min(1),
  dec: z.string().min(1),
  sy_dist: z.string().min(1),
  discoverymethod: z.string().min(1),
  disc_year: z.string().min(1),
  pl_orbper: z.string(),
  pl_orbsmax: z.string(),
  pl_orbeccen: z.string(),
  pl_rade: z.string(),
  pl_bmasse: z.string(),
  pl_eqt: z.string(),
  pl_insol: z.string(),
  st_spectype: z.string(),
  st_teff: z.string(),
  st_lum: z.string(),
  st_mass: z.string(),
  sy_vmag: z.string(),
});
export type ExoplanetRow = z.infer<typeof exoplanetRowSchema>;

export const overrideFileSchema = z.strictObject({
  $comment: z.string().optional(),
  additions: z
    .array(
      z.strictObject({
        slug: z.string().regex(/^[a-z0-9-]+$/),
        proper: z.string().min(1).optional(),
        other: z.array(z.string().min(1)).default([]),
        raDeg: z.number(),
        decDeg: z.number(),
        parallaxMas: z.number().positive(),
        spect: z.string().min(1),
      }),
    )
    .default([]),
  corrections: z
    .array(
      z.strictObject({
        id: z.string().regex(/^hyg:\d+$/),
        proper: z.string().min(1).optional(),
        other: z.array(z.string().min(1)).default([]),
        spect: z.string().min(1).optional(),
      }),
    )
    .default([]),
  // Archive hosts under the 30 ly gate that are confirmed absent from HYG and the overrides.
  knownMissingHosts: z.array(z.string().min(1)).default([]),
});
export type OverrideFile = z.infer<typeof overrideFileSchema>;
