import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { CatalogueMeta, Planet, Star, StarSystem } from '../src/types/catalogue';
import { assemble, HOST_GATE_LY } from './lib/assemble';
import { LY_PER_PC } from './lib/coords';
import {
  RADIUS_PC,
  additionToDraft,
  applyCorrection,
  distPcToLy,
  hygRowToDraft,
  isInCatalogue,
  rowsToHosts,
} from './lib/drafts';
import {
  ATNF_ENDPOINT,
  ATNF_VERSION,
  HORIZONS_ENDPOINT,
  HYG_SHA256,
  HYG_URL,
  HYG_VERSION,
  TAP_ENDPOINT,
  loadAtnfEphemerides,
  loadExoplanets,
  loadHorizonsVectors,
  loadHyg,
} from './lib/fetch';
import type { FetchedFile } from './lib/fetch';
import { computeIdMap } from './lib/idmap';
import { PLAQUE_PULSARS, PROBE_EPOCH, PROBES, buildProbeData } from './lib/probes';
import type { OverrideFile } from './lib/schema';
import {
  exoplanetRowSchema,
  hygRowSchema,
  metaSchema,
  overrideFileSchema,
  probeDataSchema,
  starSchema,
  systemSchema,
  validateCatalogue,
} from './lib/schema';
import {
  SOLAR_FACT_SHEET_FETCHED_AT,
  SOLAR_FACT_SHEET_URL,
  SOLAR_FACT_SHEET_VERSION,
} from './lib/solarPlanets';

const ROOT = resolve(import.meta.dirname, '..');
const RAW_DIR = join(ROOT, 'data/raw');
const OVERRIDES_DIR = join(ROOT, 'data/overrides');
const OUT_DIR = join(ROOT, 'public/data');

const ATTRIBUTION =
  'Star data from the HYG Database by David Nash (astronexus.com/hyg), licensed CC BY-SA 4.0. ' +
  'This research has made use of the NASA Exoplanet Archive, which is operated by the California ' +
  'Institute of Technology, under contract with NASA under the Exoplanet Exploration Program. ' +
  'Hand-curated nearby objects use values from SIMBAD (CDS, Strasbourg). Probe state vectors ' +
  'come from JPL Horizons (NASA/JPL Solar System Dynamics). Pulsar positions come from the ATNF ' +
  'Pulsar Catalogue (Manchester et al. 2005, AJ 129, 1993). The derived catalogue is ' +
  'distributed under CC BY-SA 4.0.';

function loadOverrides(): OverrideFile {
  const merged: OverrideFile = { additions: [], corrections: [], knownMissingHosts: [] };
  for (const file of readdirSync(OVERRIDES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()) {
    const parsed = overrideFileSchema.parse(
      JSON.parse(readFileSync(join(OVERRIDES_DIR, file), 'utf8')),
    );
    merged.additions.push(...parsed.additions);
    merged.corrections.push(...parsed.corrections);
    merged.knownMissingHosts.push(...parsed.knownMissingHosts);
  }
  return merged;
}

function readPrevious<T>(file: string, schema: z.ZodType<T>, fallback: T): T {
  const path = join(OUT_DIR, file);
  if (!existsSync(path)) return fallback;
  const parsed = schema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    console.warn(`Previous ${file} doesn't match the current shape; the idMap ignores it.`);
    return fallback;
  }
  return parsed.data;
}

/** One record per line, so a rebuild diffs by star rather than as one enormous line. */
function toJsonLines(records: readonly unknown[]): string {
  return `[\n${records.map((record) => JSON.stringify(record)).join(',\n')}\n]\n`;
}

function logReport(
  result: ReturnType<typeof assemble>,
  stars: readonly Star[],
  systems: readonly StarSystem[],
  planets: readonly Planet[],
  idMap: Readonly<Record<string, string>>,
): void {
  const bySource = (source: Star['source']) => stars.filter((s) => s.source === source).length;
  const byMethod = (method: string) => result.matches.filter((m) => m.method === method).length;
  const multiple = systems.filter((system) => system.starIds.length > 1);
  const starById = new Map(stars.map((star) => [star.id, star]));

  console.log('\nBuild report');
  console.log(
    `  Stars:   ${stars.length} (HYG ${bySource('hyg')}, ` +
      `overrides ${bySource('override')}, archive hosts ${bySource('exoplanet-archive')})`,
  );
  console.log(`  Systems: ${systems.length} (${multiple.length} multiple)`);
  console.log(
    `  Motion:  ${systems.filter((system) => system.motion?.radialKnown).length} full, ` +
      `${systems.filter((system) => system.motion && !system.motion.radialKnown).length} without ` +
      `radial velocity, ${systems.filter((system) => !system.motion).length} none`,
  );
  console.log(
    `  Planets: ${planets.length} on ${result.matches.length + result.unmatchedHosts.length} hosts`,
  );
  console.log(
    `  Host matches: HIP ${byMethod('hip')}, HD ${byMethod('hd')}, ` +
      `Gliese ${byMethod('gliese')}, position ${byMethod('position')}`,
  );
  console.log(`  idMap entries: ${Object.keys(idMap).length}`);

  console.log('\nPositional matches');
  for (const match of result.matches.filter((m) => m.method === 'position')) {
    const star = starById.get(match.starId);
    const separation = (match.separationArcsec ?? 0).toFixed(1);
    console.log(`  ${match.hostname} -> ${star?.displayName} (${match.starId}, ${separation}")`);
  }

  console.log(
    `\nUnmatched hosts, added from archive coordinates (${result.unmatchedHosts.length})`,
  );
  for (const host of [...result.unmatchedHosts].sort((a, b) => a.distPc - b.distPc)) {
    console.log(`  ${host.hostname} (${distPcToLy(host.distPc).toFixed(2)} ly)`);
  }

  for (const name of result.staleKnownMissingHosts) {
    console.warn(`\nWarning: knownMissingHosts entry "${name}" no longer applies; remove it.`);
  }

  const { relocatedCompanions } = result;
  console.log(`\nCompanions moved to their primary's distance (${relocatedCompanions.length})`);
  const farthest = [...relocatedCompanions].sort((a, b) => b.movedLy - a.movedLy).slice(0, 5);
  for (const { id, primaryId, movedLy } of farthest) {
    const name = starById.get(id)?.displayName;
    const primaryName = starById.get(primaryId)?.displayName;
    console.log(`  ${name} -> ${primaryName}: moved ${movedLy.toFixed(2)} ly`);
  }
}

async function main(): Promise<void> {
  const offline = process.argv.includes('--offline');
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const hyg = await loadHyg(RAW_DIR, offline);
  const exoplanets = await loadExoplanets(RAW_DIR, offline);
  const overrides = loadOverrides();
  const horizons: FetchedFile[] = [];
  for (const { horizonsId } of PROBES) {
    // One at a time, as Horizons serves a batch of parallel requests poorly.
    horizons.push(await loadHorizonsVectors(RAW_DIR, horizonsId, PROBE_EPOCH, offline));
  }
  const atnf = await loadAtnfEphemerides(
    RAW_DIR,
    PLAQUE_PULSARS.map((pulsar) => pulsar.jName),
    offline,
  );
  const probeData = probeDataSchema.parse(
    buildProbeData(
      horizons.map((file) => file.text),
      atnf.text,
    ),
  );

  const hygRows = z
    .array(hygRowSchema)
    .parse(parse(hyg.text, { columns: true, skip_empty_lines: true }));
  const exoplanetRows = z
    .array(exoplanetRowSchema)
    .parse(parse(exoplanets.text, { columns: true, skip_empty_lines: true }));
  const planetRows = exoplanetRows.filter((row) => Number(row.sy_dist) < RADIUS_PC);

  const drafts = [
    ...hygRows.filter(isInCatalogue).map(hygRowToDraft),
    ...overrides.additions.map(additionToDraft),
  ];
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft]));
  for (const correction of overrides.corrections) {
    const draft = draftsById.get(correction.id);
    if (!draft) throw new Error(`Override correction targets a missing star: ${correction.id}`);
    applyCorrection(draft, correction);
  }

  const result = assemble({
    drafts,
    hosts: rowsToHosts(planetRows),
    planetRows,
    knownMissingHosts: overrides.knownMissingHosts,
  });

  const idMap = computeIdMap({
    previousStars: readPrevious('stars.json', z.array(starSchema), []),
    previousSystems: readPrevious('systems.json', z.array(systemSchema), []),
    previousIdMap: readPrevious('meta.json', z.looseObject({ idMap: metaSchema.shape.idMap }), {
      idMap: {},
    }).idMap,
    stars: result.stars,
    systems: result.systems,
  });

  const meta: CatalogueMeta = {
    buildDate: new Date().toISOString(),
    radiusLy: Math.round(RADIUS_PC * LY_PER_PC),
    sources: [
      {
        name: 'HYG Database',
        version: HYG_VERSION,
        url: HYG_URL,
        licence: 'CC BY-SA 4.0',
        sha256: HYG_SHA256,
        fetchedAt: hyg.fetchedAt,
      },
      {
        name: 'NASA Exoplanet Archive (pscomppars)',
        version: exoplanets.fetchedAt.slice(0, 10),
        url: TAP_ENDPOINT,
        licence: 'Public; acknowledgement requested',
        fetchedAt: exoplanets.fetchedAt,
      },
      {
        name: 'NASA Planetary Fact Sheet',
        version: SOLAR_FACT_SHEET_VERSION,
        url: SOLAR_FACT_SHEET_URL,
        licence: 'Public; NASA',
        fetchedAt: SOLAR_FACT_SHEET_FETCHED_AT,
      },
      {
        name: 'JPL Horizons',
        version: PROBE_EPOCH,
        url: HORIZONS_ENDPOINT,
        licence: 'Public; NASA/JPL',
        fetchedAt: horizons[0]?.fetchedAt ?? atnf.fetchedAt,
      },
      {
        name: 'ATNF Pulsar Catalogue',
        version: ATNF_VERSION,
        url: ATNF_ENDPOINT,
        licence: 'Public; acknowledgement requested',
        fetchedAt: atnf.fetchedAt,
      },
    ],
    counts: {
      stars: result.stars.length,
      systems: result.systems.length,
      planets: result.planets.length,
    },
    unmatchedHosts: [...result.unmatchedHosts]
      .sort((a, b) => a.distPc - b.distPc)
      .map((host) => ({
        hostname: host.hostname,
        distLy: Number(distPcToLy(host.distPc).toFixed(2)),
      })),
    attribution: ATTRIBUTION,
    idMap,
  };

  const catalogue = validateCatalogue({
    stars: result.stars,
    systems: result.systems,
    planets: result.planets,
    meta,
  });

  writeFileSync(join(OUT_DIR, 'stars.json'), toJsonLines(catalogue.stars));
  writeFileSync(join(OUT_DIR, 'systems.json'), toJsonLines(catalogue.systems));
  writeFileSync(join(OUT_DIR, 'planets.json'), toJsonLines(catalogue.planets));
  writeFileSync(join(OUT_DIR, 'probes.json'), `${JSON.stringify(probeData, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, 'meta.json'), `${JSON.stringify(catalogue.meta, null, 2)}\n`);

  logReport(result, catalogue.stars, catalogue.systems, catalogue.planets, idMap);
  console.log(`\nWrote ${OUT_DIR}; host gate (${HOST_GATE_LY} ly) passed.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
