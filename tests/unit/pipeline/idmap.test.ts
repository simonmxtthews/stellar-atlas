// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeIdMap } from '../../../scripts/lib/idmap';
import type { Star, StarSystem } from '../../../src/types/catalogue';

const star = (id: string, names: Partial<Star['names']>, systemId = `sys:${id}`): Star => ({
  id,
  systemId,
  names: { other: [], ...names },
  displayName: id,
  pos: [1, 0, 0],
  distLy: 1,
  spectral: { cls: 'M' },
  massEstimated: false,
  colorHex: '#ffffff',
  isPrimary: true,
  planetIds: [],
  source: 'hyg',
});

const system = (id: string, starIds: readonly string[]): StarSystem => ({
  id,
  name: id,
  starIds,
  pos: [1, 0, 0],
  distLy: 1,
  planetCount: 0,
});

const empty = { previousIdMap: {}, previousStars: [], previousSystems: [], stars: [], systems: [] };

describe('computeIdMap', () => {
  it('is empty when nothing changed', () => {
    const stars = [star('hyg:1', { hip: 'HIP 1' })];
    const systems = [system('sys:hyg:1', ['hyg:1'])];
    const map = computeIdMap({
      ...empty,
      previousStars: stars,
      previousSystems: systems,
      stars,
      systems,
    });
    expect(map).toEqual({});
  });

  it('follows an injected host that later gets a HYG record', () => {
    const before = star('exo:teegardens-star', { other: ["Teegarden's Star"] });
    const after = star('hyg:9', { hip: 'HIP 9', other: ["Teegarden's Star"] }, 'sys:hyg:9');
    const map = computeIdMap({
      ...empty,
      previousStars: [before],
      previousSystems: [system('sys:exo:teegardens-star', [before.id])],
      stars: [after],
      systems: [system('sys:hyg:9', [after.id])],
    });
    expect(map).toEqual({
      'exo:teegardens-star': 'hyg:9',
      'sys:exo:teegardens-star': 'sys:hyg:9',
    });
  });

  it('follows a system whose primary now belongs to another system', () => {
    const merged = star('hyg:2', { hip: 'HIP 2' }, 'sys:hyg:1');
    const map = computeIdMap({
      ...empty,
      previousStars: [star('hyg:2', { hip: 'HIP 2' })],
      previousSystems: [system('sys:hyg:2', ['hyg:2'])],
      stars: [star('hyg:1', {}), merged],
      systems: [system('sys:hyg:1', ['hyg:1', 'hyg:2'])],
    });
    expect(map).toEqual({ 'sys:hyg:2': 'sys:hyg:1' });
  });

  it('leaves out stars with no successor', () => {
    const map = computeIdMap({ ...empty, previousStars: [star('hyg:1', { hip: 'HIP 1' })] });
    expect(map).toEqual({});
  });

  it('keeps older entries and points them at the end of the chain', () => {
    const map = computeIdMap({
      ...empty,
      previousIdMap: { 'hyg:old': 'hyg:middle' },
      previousStars: [star('hyg:middle', { hip: 'HIP 5' })],
      stars: [star('hyg:new', { hip: 'HIP 5' })],
    });
    expect(map).toEqual({ 'hyg:middle': 'hyg:new', 'hyg:old': 'hyg:new' });
  });

  it('drops an entry when its ID returns', () => {
    const map = computeIdMap({
      ...empty,
      previousIdMap: { 'hyg:back': 'hyg:other' },
      stars: [star('hyg:back', {}), star('hyg:other', {})],
    });
    expect(map).toEqual({});
  });
});
