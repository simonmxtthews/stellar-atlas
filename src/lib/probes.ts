import type { Position, Probe, StarSystem } from '../types/catalogue';
import { distanceLy } from './routes';

export const MAX_YEARS_AHEAD = 100_000;
export const PROBE_COLORS = ['#fbbf24', '#34d399', '#f87171', '#a78bfa', '#22d3ee'] as const;

export function probePositionAt(probe: Probe, epochYear: number, year: number): Position {
  const elapsed = year - epochYear;
  const [x, y, z] = probe.pos;
  const [vx, vy, vz] = probe.velLyPerYear;
  return [x + vx * elapsed, y + vy * elapsed, z + vz * elapsed];
}

// A point the given distance further along the straight-line path, for drawing it.
export function probePathEnd(probe: Probe, reachLy: number): Position {
  const [x, y, z] = probe.pos;
  const [vx, vy, vz] = probe.velLyPerYear;
  const scale = reachLy / Math.hypot(vx, vy, vz);
  return [x + vx * scale, y + vy * scale, z + vz * scale];
}

export interface Approach {
  readonly system: StarSystem;
  readonly distanceLy: number;
  readonly year: number;
}

// Systems the path passes within the given distance of, soonest first. Star positions are fixed,
// and a system whose closest point lies behind the probe is never approached at all.
export function closestApproaches(
  probe: Probe,
  epochYear: number,
  systems: readonly StarSystem[],
  withinLy: number,
): readonly Approach[] {
  const [px, py, pz] = probe.pos;
  const [vx, vy, vz] = probe.velLyPerYear;
  const speedSquared = vx * vx + vy * vy + vz * vz;
  return systems
    .flatMap((system) => {
      const [x, y, z] = system.pos;
      const elapsed = ((x - px) * vx + (y - py) * vy + (z - pz) * vz) / speedSquared;
      if (elapsed <= 0) return [];
      const year = epochYear + elapsed;
      const closest = distanceLy(probePositionAt(probe, epochYear, year), system.pos);
      return closest <= withinLy ? [{ system, distanceLy: closest, year }] : [];
    })
    .sort((a, b) => a.year - b.year);
}
