import type { Planet, Spectral, Star, StarSystem } from '../../src/types/catalogue';
import type { HostMatch } from './crossmatch';
import { matchHosts } from './crossmatch';
import { bolometricLuminosity, habitableZone, isMainSequence, massFromLuminosity } from './derive';
import type { ArchiveHost, StarDraft } from './drafts';
import { distPcToLy, draftToCandidate, hostToDraft, optionalNumber } from './drafts';
import { pickDisplayName, slugify, systemNameFromPrimary } from './names';
import type { ExoplanetRow } from './schema';
import {
  bvToTemperature,
  classColour,
  parseSpectral,
  spectralTemperature,
  temperatureToHex,
} from './spectral';
import { distance } from './coords';
import { groupSystems, MERGE_RADIUS_LY, type StarGroup } from './systems';

export const HOST_GATE_LY = 30;

const round = (value: number, places: number): number => Number(value.toFixed(places));

/** Keeps three significant figures, since these values span many orders of magnitude. */
const roundSig = (value: number): number => Number(value.toPrecision(3));

function resolveTemperature(draft: StarDraft, spectral: Spectral): number | undefined {
  if (draft.measured.tempK !== undefined) return draft.measured.tempK;
  // B−V saturates for very red stars and says little about white dwarfs, so a stated subclass wins.
  if (spectral.sub !== undefined && 'MLTYD'.includes(spectral.cls)) {
    return spectralTemperature(spectral);
  }
  if (draft.colourIndex !== undefined) return bvToTemperature(draft.colourIndex);
  return spectralTemperature(spectral);
}

function resolveColour(draft: StarDraft, spectral: Spectral): string {
  if (draft.colourIndex !== undefined) return temperatureToHex(bvToTemperature(draft.colourIndex));
  if (draft.measured.tempK !== undefined) return temperatureToHex(draft.measured.tempK);
  return classColour(spectral.cls);
}

function resolveLuminosity(draft: StarDraft, tempK: number | undefined): number | undefined {
  if (draft.measured.lumSolar !== undefined) return draft.measured.lumSolar;
  if (draft.absMag === undefined || tempK === undefined) return undefined;
  return bolometricLuminosity(draft.absMag, tempK);
}

function resolveMass(
  draft: StarDraft,
  spectral: Spectral,
  lumSolar: number | undefined,
): { massSolar?: number; massEstimated: boolean } {
  if (draft.measured.massSolar !== undefined) {
    return { massSolar: draft.measured.massSolar, massEstimated: false };
  }
  if (lumSolar === undefined || !isMainSequence(spectral, lumSolar)) {
    return { massEstimated: false };
  }
  return { massSolar: roundSig(massFromLuminosity(lumSolar)), massEstimated: true };
}

function rowToPlanet(row: ExoplanetRow, host: Star | undefined): Planet {
  if (!host) throw new Error(`No host star for planet ${row.pl_name}`);
  const semiMajorAu = optionalNumber(row.pl_orbsmax);
  const fields = {
    periodDays: optionalNumber(row.pl_orbper),
    semiMajorAu,
    eccentricity: optionalNumber(row.pl_orbeccen),
    radiusEarth: optionalNumber(row.pl_rade),
    massEarth: optionalNumber(row.pl_bmasse),
    eqTempK: optionalNumber(row.pl_eqt),
    insolEarth: optionalNumber(row.pl_insol),
  };
  return {
    id: `pl:${slugify(row.pl_name)}`,
    name: row.pl_name,
    letter: row.pl_letter,
    hostStarId: host.id,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
    discoveryMethod: row.discoverymethod,
    discoveryYear: Number(row.disc_year),
    ...(host.hzAu &&
      semiMajorAu !== undefined && {
        inHabitableZone: semiMajorAu >= host.hzAu[0] && semiMajorAu <= host.hzAu[1],
      }),
  };
}

export interface RelocatedCompanion {
  readonly id: string;
  readonly primaryId: string;
  readonly movedLy: number;
}

/**
 * HYG links wide pairs that sit within arcminutes on the sky but often gives each star its own
 * parallax, leaving companions up to 23 ly from their primaries. The link is the reliable part, so
 * a companion keeps its sky direction and takes the distance of its primary, which is the brighter
 * star and the likelier to have a good parallax.
 */
function relocateCompanions(
  drafts: readonly StarDraft[],
  groups: readonly StarGroup[],
): readonly RelocatedCompanion[] {
  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  const relocated: RelocatedCompanion[] = [];
  for (const group of groups) {
    const primary = byId.get(group.primaryId);
    if (!primary) continue;
    for (const id of group.starIds) {
      const star = byId.get(id);
      if (!star || star === primary || (!star.compPrimaryId && !star.baseName)) continue;
      const separation = distance(star.pos, primary.pos);
      if (separation <= MERGE_RADIUS_LY) continue;
      const scale = primary.distPc / star.distPc;
      const [x, y, z] = star.pos;
      star.pos = [x * scale, y * scale, z * scale];
      star.distPc = primary.distPc;
      relocated.push({ id, primaryId: primary.id, movedLy: separation });
    }
  }
  return relocated;
}

export interface AssembleInput {
  readonly drafts: readonly StarDraft[];
  readonly hosts: readonly ArchiveHost[];
  readonly planetRows: readonly ExoplanetRow[];
  readonly knownMissingHosts: readonly string[];
}

export interface AssembleResult {
  readonly stars: readonly Star[];
  readonly systems: readonly StarSystem[];
  readonly planets: readonly Planet[];
  readonly matches: readonly HostMatch[];
  readonly unmatchedHosts: readonly ArchiveHost[];
  readonly staleKnownMissingHosts: readonly string[];
  readonly relocatedCompanions: readonly RelocatedCompanion[];
}

export function assemble(input: AssembleInput): AssembleResult {
  const { matches, unmatched } = matchHosts(input.hosts, input.drafts.map(draftToCandidate));

  const knownMissing = new Set(input.knownMissingHosts);
  const unexplained = unmatched.filter(
    (host) => distPcToLy(host.distPc) < HOST_GATE_LY && !knownMissing.has(host.hostname),
  );
  if (unexplained.length > 0) {
    const list = unexplained.map((host) => `  ${host.hostname}`).join('\n');
    throw new Error(
      `Planet hosts within ${HOST_GATE_LY} ly match no star. Fix the match, add the star to ` +
        `data/overrides, or list it under knownMissingHosts once confirmed absent from HYG:\n${list}`,
    );
  }

  const draftsById = new Map(input.drafts.map((draft) => [draft.id, draft]));
  const hostsByName = new Map(input.hosts.map((host) => [host.hostname, host]));
  const hostStarIds = new Map<string, string>();

  for (const match of matches) {
    const draft = draftsById.get(match.starId);
    const host = hostsByName.get(match.hostname);
    if (!draft || !host) continue;
    hostStarIds.set(host.hostname, draft.id);
    // The archive's stellar parameters are newer than HYG's V-band derivations.
    draft.measured = { ...host.measured, ...draft.measured };
    if (host.spectralRaw && parseSpectral(draft.spectralRaw).sub === undefined) {
      draft.spectralRaw = host.spectralRaw;
    }
    if (!draft.names.other.includes(host.hostname)) draft.names.other.push(host.hostname);
  }

  const injected = unmatched.map((host) => {
    const draft = hostToDraft(host);
    hostStarIds.set(host.hostname, draft.id);
    return draft;
  });
  const drafts = [...input.drafts, ...injected];

  const groups = groupSystems(drafts);
  const relocatedCompanions = relocateCompanions(drafts, groups);
  const systemIdByStar = new Map<string, string>();
  for (const group of groups) {
    for (const id of group.starIds) systemIdByStar.set(id, `sys:${group.primaryId}`);
  }
  const primaryIds = new Set(groups.map((group) => group.primaryId));

  const firstPass = new Map<string, Star>();
  for (const draft of drafts) {
    const spectral = parseSpectral(draft.spectralRaw);
    const tempK = resolveTemperature(draft, spectral);
    const lumSolar = resolveLuminosity(draft, tempK);
    const hzAu = lumSolar === undefined ? undefined : habitableZone(lumSolar);
    const names = { ...draft.names, other: [...new Set(draft.names.other)] };
    firstPass.set(draft.id, {
      id: draft.id,
      systemId: systemIdByStar.get(draft.id) ?? `sys:${draft.id}`,
      names,
      displayName: pickDisplayName(names, draft.id),
      pos: [round(draft.pos[0], 4), round(draft.pos[1], 4), round(draft.pos[2], 4)],
      distLy: round(distPcToLy(draft.distPc), 4),
      ...(draft.mag !== undefined && { mag: draft.mag }),
      ...(draft.absMag !== undefined && { absMag: round(draft.absMag, 3) }),
      spectral,
      ...(tempK !== undefined && { tempK: Math.round(tempK) }),
      ...(lumSolar !== undefined && { lumSolar: roundSig(lumSolar) }),
      ...resolveMass(draft, spectral, lumSolar),
      ...(hzAu && { hzAu: [round(hzAu[0], 4), round(hzAu[1], 4)] as const }),
      colorHex: resolveColour(draft, spectral),
      isPrimary: primaryIds.has(draft.id),
      planetIds: [],
      source: draft.source,
    });
  }

  const planets = input.planetRows
    .map((row) => {
      const hostId = hostStarIds.get(row.hostname);
      return rowToPlanet(row, hostId === undefined ? undefined : firstPass.get(hostId));
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const planetIdsByStar = new Map<string, string[]>();
  for (const planet of planets) {
    planetIdsByStar.set(planet.hostStarId, [
      ...(planetIdsByStar.get(planet.hostStarId) ?? []),
      planet.id,
    ]);
  }

  const stars = [...firstPass.values()]
    .map((star) => ({ ...star, planetIds: planetIdsByStar.get(star.id) ?? [] }))
    .sort((a, b) => a.distLy - b.distLy || a.id.localeCompare(b.id));
  const starsById = new Map(stars.map((star) => [star.id, star]));

  const draftOf = new Map(drafts.map((draft) => [draft.id, draft]));
  const systems = groups
    .map((group): StarSystem => {
      const primary = starsById.get(group.primaryId);
      if (!primary) throw new Error(`Missing primary ${group.primaryId}`);
      // Companions travel together, so any star's motion serves. The best measured wins, primary
      // first, as a companion may have what its primary lacks.
      const motions = group.starIds.flatMap((id) => draftOf.get(id)?.motion ?? []);
      const motion = motions.find(({ radialKnown }) => radialKnown) ?? motions[0];
      return {
        id: `sys:${group.primaryId}`,
        name:
          group.starIds.length > 1
            ? systemNameFromPrimary(primary.names, primary.displayName)
            : primary.displayName,
        starIds: group.starIds,
        pos: primary.pos,
        distLy: primary.distLy,
        planetCount: group.starIds.reduce(
          (count, id) => count + (starsById.get(id)?.planetIds.length ?? 0),
          0,
        ),
        ...(motion && { motion }),
      };
    })
    .sort((a, b) => a.distLy - b.distLy || a.id.localeCompare(b.id));

  const unmatchedNames = new Set(unmatched.map((host) => host.hostname));
  return {
    stars,
    systems,
    planets,
    matches,
    unmatchedHosts: unmatched,
    staleKnownMissingHosts: input.knownMissingHosts.filter((name) => !unmatchedNames.has(name)),
    relocatedCompanions,
  };
}
