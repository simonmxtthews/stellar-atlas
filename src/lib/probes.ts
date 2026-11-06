import type { Position, Probe, StarSystem } from '../types/catalogue';

export const MAX_YEARS_AHEAD = 100_000;
export const STAR_EPOCH_YEAR = 2000; // the catalogue's positions are J2000
export const PROBE_COLORS = ['#f0c674', '#6fd8a8', '#f28b82', '#b79cf2', '#6fd0e8'] as const;

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
  readonly rough: boolean; // the star's motion is missing, or has no radial velocity
}

const NO_MOTION: Position = [0, 0, 0];

// Where the probe and each moving star come closest over the next MAX_YEARS_AHEAD, soonest first.
// Both travel in straight lines, and a pair already drawing apart is never approached at all.
export function closestApproaches(
  probe: Probe,
  epochYear: number,
  systems: readonly StarSystem[],
  withinLy: number,
): readonly Approach[] {
  const [px, py, pz] = probe.pos;
  const [vx, vy, vz] = probe.velLyPerYear;
  const sinceStarEpoch = epochYear - STAR_EPOCH_YEAR;
  return systems
    .flatMap((system) => {
      const [svx, svy, svz] = system.motion?.velLyPerYear ?? NO_MOTION;
      const dx = system.pos[0] + svx * sinceStarEpoch - px;
      const dy = system.pos[1] + svy * sinceStarEpoch - py;
      const dz = system.pos[2] + svz * sinceStarEpoch - pz;
      const [rx, ry, rz] = [svx - vx, svy - vy, svz - vz];
      const elapsed = -(dx * rx + dy * ry + dz * rz) / (rx * rx + ry * ry + rz * rz);
      // Not > 0 also catches NaN, from a star keeping exact pace with the probe.
      if (!(elapsed > 0) || elapsed > MAX_YEARS_AHEAD) return [];
      const closest = Math.hypot(dx + rx * elapsed, dy + ry * elapsed, dz + rz * elapsed);
      if (closest > withinLy) return [];
      return [
        {
          system,
          distanceLy: closest,
          year: epochYear + elapsed,
          rough: !system.motion?.radialKnown,
        },
      ];
    })
    .sort((a, b) => a.year - b.year);
}
