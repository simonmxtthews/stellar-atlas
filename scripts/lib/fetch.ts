import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const HYG_VERSION = 'v4.2';
// Pinned to a commit, because the repo moves superseded versions from CURRENT/ to OLDER/.
export const HYG_URL =
  'https://codeberg.org/astronexus/hyg/media/commit/f3b7a9f0a756a55a0d1ddba5507f4750ab7a0bfa/data/hyg/OLDER/hyg_v42.csv.gz';
export const HYG_SHA256 = '5ca9431ff364c8002a4a3efa91b2b9296746aea1543374db4cb6b4fab049d601';

export const TAP_ENDPOINT = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const EXOPLANET_QUERY = `select pl_name, pl_letter, hostname, hd_name, hip_name, gaia_dr3_id, ra, dec, sy_dist,
       sy_snum, sy_pnum, discoverymethod, disc_year, pl_orbper, pl_orbsmax,
       pl_orbeccen, pl_rade, pl_bmasse, pl_eqt, pl_insol, st_spectype, st_teff,
       st_lum, st_mass, sy_vmag
from pscomppars where sy_dist < 30.7`;

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 15_000;

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function writeAtomically(path: string, data: Uint8Array | string): void {
  const partial = `${path}.partial`;
  writeFileSync(partial, data);
  renameSync(partial, path);
}

async function download(url: string, label: string): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      const body = (await response.text()).slice(0, 500);
      // A 4xx is a bad request, which no amount of retrying will fix.
      if (response.status < 500) throw new Error(`${label}: HTTP ${response.status}\n${body}`);
      if (attempt >= MAX_ATTEMPTS) throw new Error(`${label}: HTTP ${response.status}`);
      console.warn(`  ${label}: HTTP ${response.status}, retrying (${attempt}/${MAX_ATTEMPTS})`);
    } catch (error) {
      const isNetworkError = error instanceof TypeError;
      if (!isNetworkError || attempt >= MAX_ATTEMPTS) throw error;
      console.warn(`  ${label}: ${error.message}, retrying (${attempt}/${MAX_ATTEMPTS})`);
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}

export interface FetchedFile {
  readonly text: string;
  readonly fetchedAt: string;
}

/** Downloads the pinned HYG CSV unless a copy with the right checksum is already on disk. */
export async function loadHyg(rawDir: string, offline: boolean): Promise<FetchedFile> {
  const path = join(rawDir, 'hyg_v42.csv.gz');
  const cached = existsSync(path) ? readFileSync(path) : undefined;
  let gz: Uint8Array;
  if (cached && sha256(cached) === HYG_SHA256) {
    console.log('HYG: checksum matches, using cached copy');
    gz = cached;
  } else {
    if (offline) throw new Error(`--offline: no valid HYG copy at ${path}`);
    console.log(`HYG: downloading ${HYG_VERSION}`);
    gz = await download(HYG_URL, 'HYG');
    const actual = sha256(gz);
    if (actual !== HYG_SHA256) {
      throw new Error(`HYG checksum mismatch: expected ${HYG_SHA256}, got ${actual}`);
    }
    writeAtomically(path, gz);
  }
  return {
    text: gunzipSync(gz).toString('utf8'),
    fetchedAt: statSync(path).mtime.toISOString(),
  };
}

/** Re-runs the TAP query each build so new planets arrive; `--offline` reuses the last result. */
export async function loadExoplanets(rawDir: string, offline: boolean): Promise<FetchedFile> {
  const path = join(rawDir, 'exoplanets.csv');
  if (offline) {
    if (!existsSync(path)) throw new Error(`--offline: no cached archive result at ${path}`);
    console.log('Exoplanet Archive: --offline, using cached result');
  } else {
    console.log('Exoplanet Archive: running TAP query');
    const params = new URLSearchParams({ query: EXOPLANET_QUERY, format: 'csv' });
    const data = await download(`${TAP_ENDPOINT}?${params}`, 'Exoplanet Archive');
    const text = new TextDecoder().decode(data);
    // TAP reports query errors as XML, sometimes with a success status.
    if (!text.startsWith('pl_name,')) {
      throw new Error(`Exoplanet Archive: unexpected response\n${text.slice(0, 500)}`);
    }
    writeAtomically(path, text);
  }
  return { text: readFileSync(path, 'utf8'), fetchedAt: statSync(path).mtime.toISOString() };
}

export const HORIZONS_ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api';
export const ATNF_ENDPOINT = 'https://www.atnf.csiro.au/research/pulsar/psrcat/proc_form.php';
export const ATNF_VERSION = '2.6.1';

// A pinned query gives the same answer every time, so a cached copy never goes stale.
async function loadPinned(
  path: string,
  label: string,
  url: string,
  marker: string,
  offline: boolean,
): Promise<FetchedFile> {
  if (!existsSync(path)) {
    if (offline) throw new Error(`--offline: no cached ${label} result at ${path}`);
    console.log(`${label}: downloading`);
    const text = new TextDecoder().decode(await download(url, label));
    if (!text.includes(marker)) {
      throw new Error(`${label}: unexpected response\n${text.slice(0, 500)}`);
    }
    writeAtomically(path, text);
  }
  return { text: readFileSync(path, 'utf8'), fetchedAt: statSync(path).mtime.toISOString() };
}

/** Heliocentric ICRF state vectors at the reference epoch, in AU and AU/day. */
export function loadHorizonsVectors(
  rawDir: string,
  horizonsId: string,
  epoch: string,
  offline: boolean,
): Promise<FetchedFile> {
  const stop = new Date(Date.parse(`${epoch}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: `'${horizonsId}'`,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: "'500@10'",
    START_TIME: `'${epoch}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: "'1d'",
    REF_PLANE: 'FRAME',
    REF_SYSTEM: 'ICRF',
    VEC_TABLE: '2',
    OUT_UNITS: 'AU-D',
    CSV_FORMAT: 'YES',
  });
  return loadPinned(
    join(rawDir, `horizons${horizonsId}-${epoch}.txt`),
    `Horizons ${horizonsId}`,
    `${HORIZONS_ENDPOINT}?${params}`,
    '$$SOE',
    offline,
  );
}

/** Catalogue ephemerides for the named pulsars, as the page ATNF serves them. */
export function loadAtnfEphemerides(
  rawDir: string,
  jNames: readonly string[],
  offline: boolean,
): Promise<FetchedFile> {
  const params = new URLSearchParams({
    version: ATNF_VERSION,
    startUserDefined: 'true',
    pulsar_names: jNames.join('\r\n'),
    ephemeris: 'short',
    submit_ephemeris: 'Get Ephemeris',
    style: 'Short without errors',
    no_value: '*',
    state: 'query',
  });
  return loadPinned(
    join(rawDir, `atnf-${ATNF_VERSION}.html`),
    'ATNF Pulsar Catalogue',
    `${ATNF_ENDPOINT}?${params}`,
    'PSRJ',
    offline,
  );
}
