import { describe, expect, it } from 'vitest';
import { galacticToScene } from '../../../src/lib/coords';
import { closestApproaches, probePositionAt } from '../../../src/lib/probes';
import { movedPosition, movedScenePositions, yearsFromCatalogue } from '../../../src/lib/mapTime';
import { distanceLy } from '../../../src/lib/routes';
import type { Probe } from '../../../src/types/catalogue';
import { starOf, systemOf } from './fixtures';

const motion = { velLyPerYear: [0.001, -0.002, 0.003], radialKnown: true } as const;

describe('yearsFromCatalogue', () => {
  it('leaves today exactly at the catalogue, and otherwise counts from its epoch', () => {
    expect(yearsFromCatalogue(0, 2026)).toBe(0);
    expect(yearsFromCatalogue(1000, 2026)).toBe(1026);
  });
});

describe('movedPosition', () => {
  it('moves a star along its velocity', () => {
    expect(movedPosition([1, 2, 3], motion, 1000)).toEqual([2, 0, 6]);
  });

  it('returns the same position with no motion or no time', () => {
    const pos = [1, 2, 3] as const;
    expect(movedPosition(pos, undefined, 1000)).toBe(pos);
    expect(movedPosition(pos, motion, 0)).toBe(pos);
  });
});

describe('movedScenePositions', () => {
  const moving = starOf({ id: 'moving', pos: [1, 2, 3] });
  const still = starOf({ id: 'still', pos: [4, 5, 6] });
  const systems = new Map([
    [moving.systemId, systemOf(moving, { motion })],
    [still.systemId, systemOf(still)],
  ]);
  const positions = Float32Array.from([
    ...galacticToScene(moving.pos),
    ...galacticToScene(still.pos),
  ]);

  it('is the same array at no years, so nothing downstream has to redo its work', () => {
    expect(movedScenePositions(positions, [moving, still], systems, 0)).toBe(positions);
  });

  it('moves stars in scene coordinates, leaves one without motion, and spares the input', () => {
    const before = Float32Array.from(positions);
    const moved = movedScenePositions(positions, [moving, still], systems, 500);
    expect([...moved.slice(0, 3)]).toEqual([...galacticToScene([1.5, 1, 4.5])]);
    expect([...moved.slice(3, 6)]).toEqual([...positions.slice(3, 6)]);
    expect(positions).toEqual(before);
  });

  it('moves a companion with its system', () => {
    const companion = starOf({ id: 'companion', systemId: moving.systemId, pos: [1, 2, 4] });
    const moved = movedScenePositions(
      Float32Array.from(galacticToScene(companion.pos)),
      [companion],
      systems,
      500,
    );
    expect([...moved]).toEqual([...galacticToScene([1.5, 1, 5.5])]);
  });
});

describe('the map and the approach table', () => {
  it('agree on how far apart a probe and a star are in the year of their approach', () => {
    const probe: Probe = {
      id: 'p',
      name: 'P',
      pos: [1, 0, 0],
      velLyPerYear: [0.001, 0, 0],
      speedKmS: 300,
    };
    const star = starOf({ id: 's', pos: [11, -5.0125, 1] });
    const system = systemOf(star, { motion: { velLyPerYear: [0, 0.0005, 0], radialKnown: true } });
    const [approach] = closestApproaches(probe, 2025, [system], 3);
    if (!approach) throw new Error('No approach');
    const years = yearsFromCatalogue(approach.year - 2026, 2026);
    expect(
      distanceLy(
        probePositionAt(probe, 2025, approach.year),
        movedPosition(star.pos, system.motion, years),
      ),
    ).toBeCloseTo(approach.distanceLy, 6);
  });
});
