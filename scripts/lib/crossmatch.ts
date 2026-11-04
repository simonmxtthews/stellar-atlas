import { angularSeparationArcsec } from './coords';
import { parseGliese } from './names';

const MAX_SEPARATION_ARCSEC = 60;
const MAX_DIST_ERROR = 0.1;

// HYG positions are J2000; the archive mostly quotes Gaia positions near this epoch.
const ARCHIVE_EPOCH_YEARS_AFTER_J2000 = 16;

export type MatchMethod = 'hip' | 'hd' | 'gliese' | 'position';

export interface HostQuery {
  readonly hostname: string;
  readonly hipName?: string;
  readonly hdName?: string;
  readonly raDeg: number;
  readonly decDeg: number;
  readonly distPc: number;
}

export interface MatchCandidate {
  readonly id: string;
  readonly hip?: string; // bare numbers, as HYG stores them
  readonly hd?: string;
  readonly gliese?: string;
  readonly raDeg: number;
  readonly decDeg: number;
  readonly distPc: number;
  readonly pmRaMasYr?: number; // includes the cos(dec) factor
  readonly pmDecMasYr?: number;
}

export interface HostMatch {
  readonly hostname: string;
  readonly starId: string;
  readonly method: MatchMethod;
  readonly separationArcsec?: number;
}

export interface MatchResult<H> {
  readonly matches: readonly HostMatch[];
  readonly unmatched: readonly H[];
}

function catalogueNumber(prefix: string, ...names: (string | undefined)[]): string | undefined {
  const pattern = new RegExp(`^${prefix}\\s*(\\d+)`, 'i');
  for (const name of names) {
    const match = name === undefined ? null : pattern.exec(name.trim());
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function hostComponent(hostname: string): string | undefined {
  return /\s([A-C])$/.exec(hostname)?.[1]?.toLowerCase();
}

/** True when the host names a component and the candidate is explicitly a different one. */
function componentConflict(hostname: string, candidate: MatchCandidate): boolean {
  const wanted = hostComponent(hostname);
  const suffix = candidate.gliese === undefined ? undefined : parseGliese(candidate.gliese)?.suffix;
  return wanted !== undefined && !!suffix && !suffix.includes(wanted);
}

function separationArcsec(host: HostQuery, star: MatchCandidate): number {
  const atJ2000 = angularSeparationArcsec(host.raDeg, host.decDeg, star.raDeg, star.decDeg);
  const years = ARCHIVE_EPOCH_YEARS_AFTER_J2000;
  const cosDec = Math.max(0.01, Math.cos((star.decDeg * Math.PI) / 180));
  const movedRa = star.raDeg + ((star.pmRaMasYr ?? 0) * years) / 3.6e6 / cosDec;
  const movedDec = star.decDeg + ((star.pmDecMasYr ?? 0) * years) / 3.6e6;
  return Math.min(atJ2000, angularSeparationArcsec(host.raDeg, host.decDeg, movedRa, movedDec));
}

/**
 * Resolves each archive host to at most one star, and each star to at most one host: by HIP,
 * then HD, then Gliese name, then position. Identifier matches all run first so a host matched
 * by position can't claim a star another host names outright.
 */
export function matchHosts<H extends HostQuery>(
  hosts: readonly H[],
  stars: readonly MatchCandidate[],
): MatchResult<H> {
  const byHip = new Map<string, MatchCandidate>();
  const byHd = new Map<string, MatchCandidate>();
  const byGliese = new Map<string, MatchCandidate>();
  const byGlieseBase = new Map<string, { star: MatchCandidate; suffix: string }>();

  for (const star of stars) {
    if (star.hip) byHip.set(star.hip, star);
    if (star.hd) byHd.set(star.hd, star);
    const key = star.gliese === undefined ? undefined : parseGliese(star.gliese);
    if (key) {
      byGliese.set(key.base + key.suffix, star);
      const current = byGlieseBase.get(key.base);
      if (!current || key.suffix < current.suffix) {
        byGlieseBase.set(key.base, { star, suffix: key.suffix });
      }
    }
  }

  const matches: HostMatch[] = [];
  const claimed = new Set<string>();
  const remaining: H[] = [];

  const claim = (host: H, star: MatchCandidate, method: MatchMethod, separation?: number) => {
    claimed.add(star.id);
    matches.push({
      hostname: host.hostname,
      starId: star.id,
      method,
      ...(separation === undefined ? {} : { separationArcsec: separation }),
    });
  };

  for (const host of hosts) {
    const hip = catalogueNumber('HIP', host.hipName, host.hostname);
    const hd = catalogueNumber('HD', host.hdName, host.hostname);
    const gliese = parseGliese(host.hostname);
    const glieseMatch = gliese
      ? (byGliese.get(gliese.base + gliese.suffix) ??
        (gliese.suffix === '' || gliese.suffix === 'a'
          ? byGlieseBase.get(gliese.base)?.star
          : undefined))
      : undefined;

    const attempts: readonly (readonly [MatchMethod, MatchCandidate | undefined])[] = [
      ['hip', hip === undefined ? undefined : byHip.get(hip)],
      ['hd', hd === undefined ? undefined : byHd.get(hd)],
      ['gliese', glieseMatch],
    ];
    const found = attempts.find(
      ([, star]) =>
        star !== undefined && !claimed.has(star.id) && !componentConflict(host.hostname, star),
    );
    if (found?.[1]) claim(host, found[1], found[0]);
    else remaining.push(host);
  }

  const unmatched: H[] = [];
  for (const host of remaining) {
    let best: MatchCandidate | undefined;
    let bestSeparation = MAX_SEPARATION_ARCSEC;
    for (const star of stars) {
      if (claimed.has(star.id) || componentConflict(host.hostname, star)) continue;
      if (Math.abs(star.distPc - host.distPc) >= MAX_DIST_ERROR * host.distPc) continue;
      const separation = separationArcsec(host, star);
      if (separation < bestSeparation) {
        best = star;
        bestSeparation = separation;
      }
    }
    if (best) claim(host, best, 'position', bestSeparation);
    else unmatched.push(host);
  }

  return { matches, unmatched };
}
