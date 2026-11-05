import { describe, expect, it } from 'vitest';
import { movedWaypoints, routeLegs, routeLengthLy, withoutWaypoint } from '../../../src/lib/routes';
import { routeEndpointIds, starHalos, systemCustomName } from '../../../src/lib/worldView';
import type { Route } from '../../../src/types/world';
import { starOf, systemOf } from '../map/fixtures';

const a = systemOf(starOf({ id: 'a', pos: [0, 0, 0] }));
const b = systemOf(starOf({ id: 'b', pos: [3, 4, 0] }));
const c = systemOf(starOf({ id: 'c', pos: [3, 4, 12] }));
const systemsById = new Map([a, b, c].map((system) => [system.id, system]));

describe('routeLegs', () => {
  it('measures each leg and totals them', () => {
    const legs = routeLegs([a.id, b.id, c.id], systemsById);
    expect(legs.map((leg) => leg.distanceLy)).toEqual([5, 12]);
    expect(routeLengthLy(legs)).toBe(17);
  });

  it('steps over an ID the catalogue no longer has', () => {
    const legs = routeLegs([a.id, 'sys:gone', b.id], systemsById);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ fromId: a.id, toId: b.id, distanceLy: 5 });
  });

  it('has no legs for a single waypoint', () => {
    expect(routeLegs([a.id], systemsById)).toEqual([]);
  });
});

describe('movedWaypoints', () => {
  it('swaps with the neighbour', () => {
    expect(movedWaypoints(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(movedWaypoints(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('refuses to go off the end', () => {
    expect(movedWaypoints(['a', 'b'], 0, -1)).toBeNull();
    expect(movedWaypoints(['a', 'b'], 1, 1)).toBeNull();
  });

  it('refuses to put a system next to itself', () => {
    expect(movedWaypoints(['a', 'b', 'a'], 2, -1)).toBeNull();
  });
});

describe('withoutWaypoint', () => {
  it('removes a stop', () => {
    expect(withoutWaypoint(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('collapses the repeat left by removing the stop between two visits', () => {
    expect(withoutWaypoint(['a', 'b', 'a', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('refuses to leave fewer than two waypoints', () => {
    expect(withoutWaypoint(['a', 'b'], 0)).toBeNull();
    expect(withoutWaypoint(['a', 'b', 'a'], 1)).toBeNull();
  });
});

describe('world views', () => {
  const route = (waypoints: readonly string[]): Route => ({
    id: waypoints.join(),
    waypoints,
    kind: 'trade',
    color: '#ffffff',
    dashed: false,
    width: 2,
  });

  it('takes route endpoints, not the stops between', () => {
    expect([...routeEndpointIds([route(['a', 'b', 'c'])])].sort()).toEqual(['a', 'c']);
  });

  it('gives a halo the first tag colour and counts the tags', () => {
    const tags = [
      { id: 't1', label: 'One', color: '#111111' },
      { id: 't2', label: 'Two', color: '#222222' },
    ];
    const halos = starHalos(
      {
        both: { tagIds: ['t2', 't1'] },
        none: { tagIds: [], notes: 'just a note' },
        dangling: { tagIds: ['gone'] },
      },
      tags,
    );
    expect(halos).toEqual([{ starId: 'both', color: '#222222', count: 2 }]);
  });

  it('names a system after its first named star', () => {
    const system = systemOf(starOf({ id: 'p' }), { starIds: ['p', 'q'] });
    expect(systemCustomName({ q: { tagIds: [], customName: ' Haven ' } }, system)).toBe('Haven');
    expect(systemCustomName({ q: { tagIds: [], customName: '  ' } }, system)).toBeUndefined();
  });
});
