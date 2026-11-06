import type { DriveModel } from '../types/world';
import { cachedJumpGraph, jumpsBetween, type GraphNode } from './graph';
import type { RouteLeg } from './routes';
import { formatValue } from './starFacts';

const DAYS_PER_YEAR = 365.25;
const SECONDS_PER_YEAR = DAYS_PER_YEAR * 86_400;
const LIGHT_SPEED_M_S = 299_792_458;
// One standard gravity in light-years per year squared, where c = 1 ly/yr.
const LY_PER_YEAR2_PER_G = (9.80665 * SECONDS_PER_YEAR) / LIGHT_SPEED_M_S;

export const DRIVE_DEFAULTS = {
  jump: { type: 'jump', maxJumpLy: 10, daysPerJump: 7 },
  'ftl-speed': { type: 'ftl-speed', multipleOfC: 50 },
  sublight: { type: 'sublight', fractionC: 0.1 },
} as const satisfies Readonly<Record<DriveModel['type'], DriveModel>>;
export const DEFAULT_DRIVE = DRIVE_DEFAULTS.jump; // the book's FTL model
export const DEFAULT_ACCEL_G = 1;

export interface TravelTime {
  readonly earthYears: number;
  readonly shipYears: number;
  readonly jumps?: number; // jump drives only
}

export function sublightTime(distanceLy: number, fractionC: number, accelG?: number): TravelTime {
  if (accelG === undefined) {
    const earthYears = distanceLy / fractionC;
    return { earthYears, shipYears: earthYears * Math.sqrt(1 - fractionC * fractionC) };
  }
  // Constant acceleration, flipping at the midpoint to brake. There is no coasting, so fractionC
  // plays no part.
  const a = accelG * LY_PER_YEAR2_PER_G;
  const gamma = 1 + (a * distanceLy) / 2;
  return {
    earthYears: (2 / a) * Math.sqrt(gamma * gamma - 1),
    shipYears: (2 / a) * Math.acosh(gamma),
  };
}

// The fewest jumps the distance could take, were there a star at every stop.
export function minimumJumps(distanceLy: number, maxJumpLy: number): number {
  return Math.ceil(distanceLy / maxJumpLy);
}

// jumps matters only to a jump drive, and null there means no chain of jumps reaches.
export function travelTime(
  drive: DriveModel,
  distanceLy: number,
  jumps: number | null,
): TravelTime | null {
  switch (drive.type) {
    case 'sublight':
      return sublightTime(distanceLy, drive.fractionC, drive.accelG);
    case 'ftl-speed': {
      const years = distanceLy / drive.multipleOfC;
      return { earthYears: years, shipYears: years };
    }
    case 'jump': {
      if (jumps === null) return null;
      const years = (jumps * drive.daysPerJump) / DAYS_PER_YEAR;
      return { earthYears: years, shipYears: years, jumps };
    }
  }
}

// Between two catalogue systems. Jumps count across the whole catalogue, so a filter that hides
// a star along the way doesn't change how long a trip takes.
export function systemTravelTime(
  drive: DriveModel,
  systems: readonly GraphNode[],
  fromId: string,
  toId: string,
  distanceLy: number,
): TravelTime | null {
  if (drive.type !== 'jump') return travelTime(drive, distanceLy, null);
  if (fromId === toId) return travelTime(drive, distanceLy, 0);
  if (distanceLy <= drive.maxJumpLy) return travelTime(drive, distanceLy, 1);
  const graph = cachedJumpGraph(systems, drive.maxJumpLy);
  return travelTime(drive, distanceLy, jumpsBetween(graph, fromId, toId));
}

export function legTravelTime(
  drive: DriveModel,
  systems: readonly GraphNode[],
  leg: RouteLeg,
): TravelTime | null {
  return systemTravelTime(drive, systems, leg.fromId, leg.toId, leg.distanceLy);
}

export function routeTravelTime(
  drive: DriveModel,
  systems: readonly GraphNode[],
  legs: readonly RouteLeg[],
): TravelTime | null {
  let earthYears = 0;
  let shipYears = 0;
  let jumps: number | undefined;
  for (const leg of legs) {
    const time = legTravelTime(drive, systems, leg);
    if (!time) return null;
    earthYears += time.earthYears;
    shipYears += time.shipYears;
    if (time.jumps !== undefined) jumps = (jumps ?? 0) + time.jumps;
  }
  return { earthYears, shipYears, ...(jumps === undefined ? {} : { jumps }) };
}

function formatYears(years: number): string {
  if (years === 0) return '0 d';
  const days = years * DAYS_PER_YEAR;
  if (days < 1) return `${formatValue(days * 24, 1)} h`;
  if (years < 1) return `${formatValue(days, days < 10 ? 1 : 0)} d`;
  return formatValue(years, 2, 'yr');
}

export function formatTravelTime(time: TravelTime | null): string {
  if (!time) return 'no jump path';
  if (time.jumps !== undefined) {
    return `${time.jumps} jump${time.jumps === 1 ? '' : 's'} · ${formatYears(time.earthYears)}`;
  }
  if (time.shipYears !== time.earthYears) {
    return `ship ${formatYears(time.shipYears)} · Earth ${formatYears(time.earthYears)}`;
  }
  return formatYears(time.earthYears);
}
