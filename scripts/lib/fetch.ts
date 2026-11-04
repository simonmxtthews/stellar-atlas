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
