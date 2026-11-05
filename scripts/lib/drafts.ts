import type { Position, StarMotion } from '../../src/types/catalogue';
import { equatorialPcToGalacticLy, LY_PER_PC, raDecToEquatorial } from './coords';
import type { MatchCandidate } from './crossmatch';
import {
  formatBayer,
  formatFlamsteed,
  formatGliese,
  isGreekAbbreviation,
  slugify,
  unnumberedBayer,
} from './names';
import type { ExoplanetRow, HygRow, OverrideFile } from './schema';

export const RADIUS_PC = 30.66; // 100 ly
export const SOL_ID = 'hyg:0';

export interface DraftNames {
  proper?: string;
  bayer?: string;
  flamsteed?: string;
  gliese?: string;
  hd?: string;
  hip?: string;
  hr?: string;
  other: string[];
}

/** Values measured or modelled by a source, which take priority over anything we'd derive. */
export interface MeasuredValues {
  tempK?: number;
  lumSolar?: number;
  massSolar?: number;
}

/** A star on its way through the pipeline: still in parsecs, still mutable. */
export interface StarDraft {
  readonly id: string;
  readonly source: 'hyg' | 'exoplanet-archive' | 'override';
  readonly names: DraftNames;
  pos: Position; // galactic, light-years
  distPc: number;
  readonly raDeg: number;
  readonly decDeg: number;
  readonly pmRaMasYr?: number;
  readonly pmDecMasYr?: number;
  readonly motion?: StarMotion;
  readonly mag?: number;
  readonly absMag?: number;
  spectralRaw?: string;
  readonly colourIndex?: number;
  measured: MeasuredValues;
  readonly compPrimaryId?: string;
  readonly baseName?: string;
  readonly matchKeys: { readonly hip?: string; readonly hd?: string; readonly gliese?: string };
}

export function optionalNumber(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`Not a number: "${text}"`);
  return value;
}

function requiredNumber(text: string, field: string): number {
  const value = optionalNumber(text);
  if (value === undefined) throw new Error(`Missing ${field}`);
  return value;
}

function nonEmpty(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function isInCatalogue(row: HygRow): boolean {
  const dist = Number(row.dist);
  return row.id === '0' || (dist > 0 && dist < RADIUS_PC);
}

const roundVelocity = (value: number): number => Number(value.toPrecision(4));

// HYG leaves rv at 0 when it has none, so a true 0 reads as unknown: harmlessly, as rough figures.
function hygMotion(row: HygRow): StarMotion | undefined {
  const velocity: Position = [
    optionalNumber(row.vx) ?? 0,
    optionalNumber(row.vy) ?? 0,
    optionalNumber(row.vz) ?? 0,
  ];
  if (velocity.every((component) => component === 0)) return undefined;
  const [x, y, z] = equatorialPcToGalacticLy(velocity);
  return {
    velLyPerYear: [roundVelocity(x), roundVelocity(y), roundVelocity(z)],
    radialKnown: (optionalNumber(row.rv) ?? 0) !== 0,
  };
}

export function hygRowToDraft(row: HygRow): StarDraft {
  const isSol = row.id === '0';
  const distPc = isSol ? 0 : requiredNumber(row.dist, 'dist');
  const con = row.con.trim();
  const bayerRaw = nonEmpty(row.bayer);
  const flam = nonEmpty(row.flam);
  const variable = nonEmpty(row.var);
  const gl = nonEmpty(row.gl);
  const hip = nonEmpty(row.hip);
  const hd = nonEmpty(row.hd);
  const hr = nonEmpty(row.hr);
  const proper = nonEmpty(row.proper);
  const bayer = bayerRaw && formatBayer(bayerRaw, con);
  const flamsteed = flam && formatFlamsteed(flam, con);

  const names: DraftNames = {
    ...(proper && { proper }),
    ...(bayer && { bayer }),
    ...(flamsteed && { flamsteed }),
    ...(gl && { gliese: formatGliese(gl) }),
    ...(hd && { hd: `HD ${hd}` }),
    ...(hip && { hip: `HIP ${hip}` }),
    ...(hr && { hr: `HR ${hr}` }),
    other: [
      ...(bayer && unnumberedBayer(bayer) ? [unnumberedBayer(bayer) ?? ''] : []),
      ...(variable && !isGreekAbbreviation(variable) ? [`${variable} ${con}`.trim()] : []),
    ],
  };

  const compPrimary = nonEmpty(row.comp_primary);
  const base = nonEmpty(row.base)?.replace(/\s+/g, ' ');
  const mag = optionalNumber(row.mag);
  const absMag = optionalNumber(row.absmag);
  const colourIndex = optionalNumber(row.ci);
  const pmRaMasYr = optionalNumber(row.pmra);
  const pmDecMasYr = optionalNumber(row.pmdec);
  const spectralRaw = nonEmpty(row.spect);
  const motion = isSol ? undefined : hygMotion(row);

  return {
    id: `hyg:${row.id}`,
    source: 'hyg',
    names,
    // HYG lists the Sun a few AU off zero; it is the origin by definition.
    pos: isSol
      ? [0, 0, 0]
      : equatorialPcToGalacticLy([
          requiredNumber(row.x, 'x'),
          requiredNumber(row.y, 'y'),
          requiredNumber(row.z, 'z'),
        ]),
    distPc,
    raDeg: requiredNumber(row.ra, 'ra') * 15,
    decDeg: requiredNumber(row.dec, 'dec'),
    ...(pmRaMasYr !== undefined && { pmRaMasYr }),
    ...(pmDecMasYr !== undefined && { pmDecMasYr }),
    ...(motion && { motion }),
    ...(mag !== undefined && { mag }),
    ...(absMag !== undefined && { absMag }),
    ...(spectralRaw && { spectralRaw }),
    ...(colourIndex !== undefined && { colourIndex }),
    measured: isSol ? { tempK: 5772, lumSolar: 1, massSolar: 1 } : {},
    ...(compPrimary && compPrimary !== row.id && { compPrimaryId: `hyg:${compPrimary}` }),
    ...(base && { baseName: base }),
    matchKeys: { ...(hip && { hip }), ...(hd && { hd }), ...(gl && { gliese: gl }) },
  };
}

export function additionToDraft(addition: OverrideFile['additions'][number]): StarDraft {
  const distPc = 1000 / addition.parallaxMas;
  return {
    id: `ovr:${addition.slug}`,
    source: 'override',
    names: { ...(addition.proper && { proper: addition.proper }), other: addition.other },
    pos: equatorialPcToGalacticLy(raDecToEquatorial(addition.raDeg, addition.decDeg, distPc)),
    distPc,
    raDeg: addition.raDeg,
    decDeg: addition.decDeg,
    spectralRaw: addition.spect,
    measured: {},
    matchKeys: {},
  };
}

export function applyCorrection(
  draft: StarDraft,
  correction: OverrideFile['corrections'][number],
): void {
  if (correction.proper) draft.names.proper = correction.proper;
  if (correction.spect) draft.spectralRaw = correction.spect;
  draft.names.other.push(...correction.other);
}

export function draftToCandidate(draft: StarDraft): MatchCandidate {
  return {
    id: draft.id,
    ...draft.matchKeys,
    raDeg: draft.raDeg,
    decDeg: draft.decDeg,
    distPc: draft.distPc,
    ...(draft.pmRaMasYr !== undefined && { pmRaMasYr: draft.pmRaMasYr }),
    ...(draft.pmDecMasYr !== undefined && { pmDecMasYr: draft.pmDecMasYr }),
  };
}

export interface ArchiveHost {
  readonly hostname: string;
  readonly hipName?: string;
  readonly hdName?: string;
  readonly raDeg: number;
  readonly decDeg: number;
  readonly distPc: number;
  readonly spectralRaw?: string;
  readonly vmag?: number;
  readonly measured: MeasuredValues;
}

/** Collapses per-planet rows to hosts, taking each stellar field from the first row that has it. */
export function rowsToHosts(rows: readonly ExoplanetRow[]): readonly ArchiveHost[] {
  const grouped = new Map<string, ExoplanetRow[]>();
  for (const row of rows) grouped.set(row.hostname, [...(grouped.get(row.hostname) ?? []), row]);

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hostname, group]) => {
      const first = (field: keyof ExoplanetRow) =>
        group.map((row) => row[field].trim()).find((value) => value !== '') ?? '';
      const hipName = nonEmpty(first('hip_name'));
      const hdName = nonEmpty(first('hd_name'));
      const spectralRaw = nonEmpty(first('st_spectype'))?.replaceAll('&plusmn;', '±');
      const vmag = optionalNumber(first('sy_vmag'));
      const tempK = optionalNumber(first('st_teff'));
      const logLum = optionalNumber(first('st_lum'));
      const massSolar = optionalNumber(first('st_mass'));
      return {
        hostname,
        ...(hipName && { hipName }),
        ...(hdName && { hdName }),
        raDeg: requiredNumber(first('ra'), 'ra'),
        decDeg: requiredNumber(first('dec'), 'dec'),
        distPc: requiredNumber(first('sy_dist'), 'sy_dist'),
        ...(spectralRaw && { spectralRaw }),
        ...(vmag !== undefined && { vmag }),
        measured: {
          ...(tempK !== undefined && { tempK }),
          ...(logLum !== undefined && { lumSolar: 10 ** logLum }),
          ...(massSolar !== undefined && { massSolar }),
        },
      };
    });
}

export function hostToDraft(host: ArchiveHost): StarDraft {
  const absMag = host.vmag === undefined ? undefined : host.vmag - 5 * Math.log10(host.distPc / 10);
  return {
    id: `exo:${slugify(host.hostname)}`,
    source: 'exoplanet-archive',
    names: {
      ...(host.hdName && { hd: host.hdName }),
      ...(host.hipName && { hip: host.hipName }),
      other: [host.hostname],
    },
    pos: equatorialPcToGalacticLy(raDecToEquatorial(host.raDeg, host.decDeg, host.distPc)),
    distPc: host.distPc,
    raDeg: host.raDeg,
    decDeg: host.decDeg,
    ...(host.vmag !== undefined && { mag: host.vmag }),
    ...(absMag !== undefined && { absMag }),
    ...(host.spectralRaw && { spectralRaw: host.spectralRaw }),
    measured: host.measured,
    matchKeys: {},
  };
}

export function distPcToLy(distPc: number): number {
  return distPc * LY_PER_PC;
}
