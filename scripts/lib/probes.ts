import type { Position, ProbeData, Pulsar } from '../../src/types/catalogue';
import { equatorialToGalactic, raDecToEquatorial } from './coords';

export const PROBE_EPOCH = '2025-01-01';
const PROBE_EPOCH_YEAR = 2025;

export const PROBES = [
  { id: 'voyager-1', name: 'Voyager 1', horizonsId: '-31' },
  { id: 'voyager-2', name: 'Voyager 2', horizonsId: '-32' },
  { id: 'pioneer-10', name: 'Pioneer 10', horizonsId: '-23' },
  { id: 'pioneer-11', name: 'Pioneer 11', horizonsId: '-24' },
  { id: 'new-horizons', name: 'New Horizons', horizonsId: '-98' },
] as const;

const LY_PER_AU = 149_597_870_700 / 9_460_730_472_580_800;
const KM_PER_AU = 149_597_870.7;
const SECONDS_PER_DAY = 86_400;
const DAYS_PER_YEAR = 365.25;

// The plaque engraves each period as a whole number of hydrogen 21 cm periods.
const HYDROGEN_HZ = 1_420_405_752;

// Names and constants from Johnston, "Reading the Pioneer/Voyager Pulsar Map" (2007); the
// constants also match OEIS A350136. Plaque order, clockwise from the galactic-centre line.
export const PLAQUE_PULSARS = [
  { id: 'B1727-47', jName: 'J1731-4744', plaqueConstant: 1178486506 },
  { id: 'B1451-68', jName: 'J1456-6843', plaqueConstant: 374101871 },
  { id: 'B1240-64', jName: 'J1243-6423', plaqueConstant: 551117432 },
  { id: 'B0833-45', jName: 'J0835-4510', plaqueConstant: 126726823 },
  { id: 'B0950+08', jName: 'J0953+0755', plaqueConstant: 359455043 },
  { id: 'B0823+26', jName: 'J0826+2637', plaqueConstant: 753751947 },
  { id: 'B0531+21', jName: 'J0534+2200', plaqueConstant: 47057538 },
  { id: 'B0525+21', jName: 'J0528+2200', plaqueConstant: 5320116676 },
  { id: 'B0329+54', jName: 'J0332+5434', plaqueConstant: 1014906390 },
  { id: 'B2217+47', jName: 'J2219+4754', plaqueConstant: 764842161 },
  { id: 'B2016+28', jName: 'J2018+2839', plaqueConstant: 792520205 },
  { id: 'B1933+16', jName: 'J1935+1616', plaqueConstant: 509549854 },
  { id: 'B1929+10', jName: 'J1932+1059', plaqueConstant: 321746104 },
  { id: 'B1642-03', jName: 'J1645-0317', plaqueConstant: 550675372 },
] as const;

// A wrong pairing of name and constant shows up as a period far from the catalogue's. The plaque's
// values date from 1972 and the Crab has slowed by about 1% since, so this allows for that much.
const PERIOD_TOLERANCE = 0.02;

export interface StateVector {
  readonly posAu: Position;
  readonly velAuPerDay: Position;
}

/** The first row of a Horizons CSV vector table: JD, date, X, Y, Z, VX, VY, VZ. */
export function parseHorizonsVectors(text: string): StateVector {
  const row = /\$\$SOE\s*\n(.*)\n/.exec(text)?.[1];
  if (!row) throw new Error(`Horizons: no vector table\n${text.slice(0, 500)}`);
  const [x, y, z, vx, vy, vz] = row.split(',').slice(2, 8).map(Number);
  if (
    x === undefined ||
    y === undefined ||
    z === undefined ||
    vx === undefined ||
    vy === undefined ||
    vz === undefined ||
    [x, y, z, vx, vy, vz].some(Number.isNaN)
  ) {
    throw new Error(`Horizons: unreadable row: ${row}`);
  }
  return { posAu: [x, y, z], velAuPerDay: [vx, vy, vz] };
}

function sexagesimal(text: string): number {
  const [whole = 0, minutes = 0, seconds = 0] = text.split(':').map(Number);
  const magnitude = Math.abs(whole) + minutes / 60 + seconds / 3600;
  return text.startsWith('-') ? -magnitude : magnitude;
}

export interface AtnfEntry {
  readonly raDeg: number;
  readonly decDeg: number;
  readonly periodS: number;
}

/** ATNF's ephemeris page: one `KEY value [error]` line per field, for each pulsar. */
export function parseAtnfEphemerides(html: string): ReadonlyMap<string, AtnfEntry> {
  const entries = new Map<string, AtnfEntry>();
  for (const block of html.replace(/<[^>]*>/g, '').split(/^@-+$/m)) {
    const field = (key: string) => new RegExp(`^${key}\\s+(\\S+)`, 'm').exec(block)?.[1];
    const jName = field('PSRJ');
    const ra = field('RAJ');
    const dec = field('DECJ');
    const f0 = field('F0');
    const p0 = field('P0');
    if (!jName || !ra || !dec || (!f0 && !p0)) continue;
    entries.set(jName, {
      raDeg: sexagesimal(ra) * 15,
      decDeg: sexagesimal(dec),
      periodS: f0 ? 1 / Number(f0) : Number(p0),
    });
  }
  return entries;
}

function scaled([x, y, z]: Position, factor: number): Position {
  return [x * factor, y * factor, z * factor];
}

export function plaquePulsars(entries: ReadonlyMap<string, AtnfEntry>): readonly Pulsar[] {
  return PLAQUE_PULSARS.map(({ id, jName, plaqueConstant }) => {
    const entry = entries.get(jName);
    if (!entry) throw new Error(`ATNF: no entry for ${jName}`);
    const plaquePeriodS = plaqueConstant / HYDROGEN_HZ;
    if (Math.abs(plaquePeriodS / entry.periodS - 1) > PERIOD_TOLERANCE) {
      throw new Error(
        `${id}: plaque period ${plaquePeriodS} s is far from ATNF's ${entry.periodS} s`,
      );
    }
    return {
      id,
      jName,
      direction: equatorialToGalactic(raDecToEquatorial(entry.raDeg, entry.decDeg, 1)),
      plaquePeriodS,
    };
  });
}

export function buildProbeData(horizonsTexts: readonly string[], atnfHtml: string): ProbeData {
  return {
    epochYear: PROBE_EPOCH_YEAR,
    probes: PROBES.map(({ id, name }, i) => {
      const { posAu, velAuPerDay } = parseHorizonsVectors(horizonsTexts[i] ?? '');
      return {
        id,
        name,
        pos: scaled(equatorialToGalactic(posAu), LY_PER_AU),
        velLyPerYear: scaled(equatorialToGalactic(velAuPerDay), LY_PER_AU * DAYS_PER_YEAR),
        speedKmS: (Math.hypot(...velAuPerDay) * KM_PER_AU) / SECONDS_PER_DAY,
      };
    }),
    pulsars: plaquePulsars(parseAtnfEphemerides(atnfHtml)),
  };
}
