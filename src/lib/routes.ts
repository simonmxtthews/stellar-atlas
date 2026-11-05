import type { Position, StarSystem } from '../types/catalogue';

export interface RouteLeg {
  readonly fromId: string;
  readonly toId: string;
  readonly from: Position;
  readonly to: Position;
  readonly distanceLy: number;
}

export function distanceLy(a: Position, b: Position): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Consecutive known waypoints. An ID the catalogue no longer has is stepped over, not fatal.
export function routeLegs(
  waypoints: readonly string[],
  systemsById: ReadonlyMap<string, StarSystem>,
): readonly RouteLeg[] {
  const known = waypoints.flatMap((id) => systemsById.get(id) ?? []);
  return known.slice(1).flatMap((to, i) => {
    const from = known[i];
    if (!from) return [];
    return [
      {
        fromId: from.id,
        toId: to.id,
        from: from.pos,
        to: to.pos,
        distanceLy: distanceLy(from.pos, to.pos),
      },
    ];
  });
}

export function routeLengthLy(legs: readonly RouteLeg[]): number {
  return legs.reduce((total, leg) => total + leg.distanceLy, 0);
}

function hasRepeat(waypoints: readonly string[]): boolean {
  return waypoints.some((id, i) => id === waypoints[i - 1]);
}

// The reordered waypoints, or null if off the end or if it would put a system next to itself.
export function movedWaypoints(
  waypoints: readonly string[],
  index: number,
  step: -1 | 1,
): readonly string[] | null {
  const a = waypoints[index];
  const b = waypoints[index + step];
  if (a === undefined || b === undefined) return null;
  const moved = [...waypoints];
  moved[index] = b;
  moved[index + step] = a;
  return hasRepeat(moved) ? null : moved;
}

// Removing B from A-B-A leaves one visit to A, so repeats collapse. Null if under two remain.
export function withoutWaypoint(
  waypoints: readonly string[],
  index: number,
): readonly string[] | null {
  const remaining = waypoints
    .filter((_, i) => i !== index)
    .filter((id, i, kept) => id !== kept[i - 1]);
  return remaining.length >= 2 ? remaining : null;
}
