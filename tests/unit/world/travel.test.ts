import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../../../src/lib/graph';
import {
  formatTravelTime,
  minimumJumps,
  routeTravelTime,
  sublightTime,
  systemTravelTime,
  travelTime,
} from '../../../src/lib/travel';
import { routeLegs } from '../../../src/lib/routes';
import type { StarSystem } from '../../../src/types/catalogue';
import type { DriveModel } from '../../../src/types/world';

const jump: DriveModel = { type: 'jump', maxJumpLy: 5, daysPerJump: 7 };

describe('sublight', () => {
  it('flips and burns at 1 g over 4.37 ly in about 3.6 ship and 6.0 Earth years', () => {
    const { shipYears, earthYears } = sublightTime(4.37, 0.5, 1);
    expect(shipYears).toBeCloseTo(3.59, 1);
    expect(earthYears).toBeCloseTo(6.0, 1);
  });

  it('coasts with time dilation', () => {
    const { shipYears, earthYears } = sublightTime(8, 0.8);
    expect(earthYears).toBeCloseTo(10);
    expect(shipYears).toBeCloseTo(6);
  });

  it('shows both clocks', () => {
    expect(formatTravelTime(sublightTime(4.37, 0.5, 1))).toBe('ship 3.58 yr · Earth 6.00 yr');
  });
});

describe('FTL at constant speed', () => {
  it('divides distance by the multiple of c, with one clock', () => {
    const time = travelTime({ type: 'ftl-speed', multipleOfC: 50 }, 10, null);
    expect(time?.earthYears).toBeCloseTo(0.2);
    expect(time?.shipYears).toBe(time?.earthYears);
    expect(formatTravelTime(time)).toBe('73 d');
  });
});

describe('jump drive', () => {
  const line: GraphNode[] = [
    { id: 'a', pos: [0, 0, 0] },
    { id: 'b', pos: [4, 0, 0] },
    { id: 'c', pos: [8, 0, 0] },
    { id: 'island', pos: [50, 0, 0] },
  ];

  it('takes jumps × days per jump', () => {
    expect(travelTime(jump, 12, 3)?.earthYears).toBeCloseTo(21 / 365.25);
    expect(formatTravelTime(travelTime(jump, 12, 3))).toBe('3 jumps · 21 d');
    expect(formatTravelTime(travelTime(jump, 3, 1))).toBe('1 jump · 7.0 d');
  });

  it('counts hops along the network between systems', () => {
    expect(systemTravelTime(jump, line, 'a', 'b', 4)?.jumps).toBe(1);
    expect(systemTravelTime(jump, line, 'a', 'c', 8)?.jumps).toBe(2);
    expect(systemTravelTime(jump, line, 'a', 'a', 0)?.jumps).toBe(0);
  });

  it('reports no path to an unreachable system', () => {
    const time = systemTravelTime(jump, line, 'a', 'island', 50);
    expect(time).toBeNull();
    expect(formatTravelTime(time)).toBe('no jump path');
  });

  it('gives the straight-line lower bound', () => {
    expect(minimumJumps(4.37, 10)).toBe(1);
    expect(minimumJumps(20, 10)).toBe(2);
    expect(minimumJumps(20.1, 10)).toBe(3);
  });
});

describe('route totals', () => {
  const systems: StarSystem[] = [
    { id: 'a', name: 'A', starIds: ['a'], pos: [0, 0, 0], distLy: 0, planetCount: 0 },
    { id: 'b', name: 'B', starIds: ['b'], pos: [4, 0, 0], distLy: 4, planetCount: 0 },
    { id: 'c', name: 'C', starIds: ['c'], pos: [8, 0, 0], distLy: 8, planetCount: 0 },
    { id: 'z', name: 'Z', starIds: ['z'], pos: [90, 0, 0], distLy: 90, planetCount: 0 },
  ];
  const byId = new Map(systems.map((system) => [system.id, system]));

  it('adds up legs', () => {
    const legs = routeLegs(['a', 'b', 'c', 'a'], byId);
    expect(routeTravelTime(jump, systems, legs)?.jumps).toBe(4);
    const ftl = routeTravelTime({ type: 'ftl-speed', multipleOfC: 1 }, systems, legs);
    expect(ftl?.earthYears).toBeCloseTo(16);
  });

  it('has no total if any leg has no path', () => {
    expect(routeTravelTime(jump, systems, routeLegs(['a', 'z'], byId))).toBeNull();
  });
});
