import type { StarSystem } from '../types/catalogue';
import type { World } from '../types/world';
import { routeLegs, routeTitle } from './routes';
import { formatTravelTime, legTravelTime } from './travel';
import { systemLabel } from './worldView';

const HEADER = ['route', 'leg', 'from', 'to', 'ly', 'travel time'];

function cell(value: string): string {
  // A spreadsheet runs a cell opening like this as a formula, and world files get passed around.
  const inert = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(inert) ? `"${inert.replaceAll('"', '""')}"` : inert;
}

// One row per leg, RFC 4180 style. Waypoints the catalogue no longer has are stepped over.
export function routesCsv(
  world: World,
  systems: readonly StarSystem[],
  systemsById: ReadonlyMap<string, StarSystem>,
): string {
  const nameOf = (id: string) => systemLabel(world.starMeta, systemsById, id);
  const rows = world.routes.flatMap((route) =>
    routeLegs(route.waypoints, systemsById).map((leg, i) =>
      [
        cell(routeTitle(route, nameOf)),
        String(i + 1),
        cell(nameOf(leg.fromId)),
        cell(nameOf(leg.toId)),
        leg.distanceLy.toFixed(2),
        cell(formatTravelTime(legTravelTime(world.drive, systems, leg))),
      ].join(','),
    ),
  );
  return [HEADER.join(','), ...rows].map((row) => `${row}\r\n`).join('');
}
