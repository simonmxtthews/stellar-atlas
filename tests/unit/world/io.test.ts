import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  mergeWorlds,
  migrate,
  parseWorld,
  parseWorldFile,
  remapWorldIds,
  serialiseWorld,
  unknownIds,
  WorldFileError,
} from '../../../src/lib/io';
import { newWorld } from '../../../src/store/world';
import type { Route, World } from '../../../src/types/world';

const route: Route = {
  id: 'r1',
  name: 'Spine',
  waypoints: ['sys:a', 'sys:b', 'sys:c'],
  kind: 'military',
  color: '#ff0000',
  dashed: true,
  width: 3,
  notes: 'Patrolled',
};

const world: World = {
  ...newWorld('Test Realm'),
  tags: [{ id: 't1', label: 'Core', color: '#00ff00' }],
  starMeta: { 'hyg:1': { tagIds: ['t1'], customName: 'Haven', notes: 'Line one\nLine two' } },
  routes: [route],
  regions: [{ id: 'g1', name: 'Rim', color: '#0000ff', systemIds: ['sys:a'] }],
  view: { camera: [1, 2, 3], target: [0, 0, 0] },
};

describe('export and import', () => {
  it('round-trips identically', () => {
    const text = serialiseWorld(world);
    const back = parseWorldFile(text);
    expect(back).toEqual(world);
    expect(serialiseWorld(back)).toBe(text);
  });

  it('writes the same bytes whatever order the keys were set in', () => {
    const shuffled = Object.fromEntries(Object.entries(world).reverse()) as unknown as World;
    expect(serialiseWorld(shuffled)).toBe(serialiseWorld(world));
  });

  it('pretty-prints with sorted keys and drops empty optionals', () => {
    const text = serialiseWorld({
      ...newWorld('x'),
      routes: [{ ...route, name: undefined, notes: undefined }],
    });
    expect(text.split('\n')[1]).toBe('  "drive": {');
    expect(text).not.toContain('"notes"');
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('names the file after the world and the date', () => {
    expect(exportFileName(world, new Date('2026-11-04T12:00:00Z'))).toBe(
      'world-test-realm-2026-11-04.json',
    );
    expect(exportFileName(newWorld('★'), new Date('2026-11-04T12:00:00Z'))).toBe(
      'world-untitled-2026-11-04.json',
    );
  });
});

describe('validation', () => {
  it('rejects text that is not JSON', () => {
    expect(() => parseWorldFile('{nope')).toThrow(WorldFileError);
  });

  it('rejects a file with no schema version', () => {
    expect(() => parseWorld({ name: 'x' })).toThrow(/schemaVersion/);
    expect(() => parseWorld(null)).toThrow(/schemaVersion/);
  });

  it('rejects a newer schema rather than guessing', () => {
    expect(() => migrate({ schemaVersion: 2 })).toThrow(/schema version 2/);
  });

  it('points at the offending field', () => {
    const shortRoute = { ...route, waypoints: ['sys:a'] };
    expect(() => parseWorld({ ...world, routes: [shortRoute] })).toThrow(/routes\.0\.waypoints/);
    const badColour = { id: 't', label: 'x', color: 'red' };
    expect(() => parseWorld({ ...world, tags: [badColour] })).toThrow(/#rrggbb/);
  });

  it('rejects unexpected fields instead of silently dropping them', () => {
    expect(() => parseWorld({ ...world, colour: '#000000' })).toThrow(WorldFileError);
  });
});

describe('unknownIds', () => {
  it('reports what the catalogue lacks, sorted and once each', () => {
    const stars = new Map([['hyg:1', {}]]);
    const systems = new Map([['sys:a', {}]]);
    const withExtra: World = {
      ...world,
      starMeta: { ...world.starMeta, 'hyg:9': { tagIds: [] } },
      routes: [route, { ...route, id: 'r2', waypoints: ['sys:c', 'sys:a'] }],
    };
    expect(unknownIds(withExtra, stars, systems)).toEqual(['hyg:9', 'sys:b', 'sys:c']);
  });
});

describe('mergeWorlds', () => {
  const ours: World = {
    ...newWorld('Ours'),
    tags: [{ id: 't1', label: 'Ours', color: '#111111' }],
    routes: [{ ...route, name: 'Ours' }],
    starMeta: { 'hyg:1': { tagIds: ['t1'], customName: 'Ours' } },
  };
  const theirs: World = {
    ...newWorld('Theirs'),
    drive: { type: 'ftl-speed', multipleOfC: 50 },
    tags: [
      { id: 't1', label: 'Theirs', color: '#222222' },
      { id: 't2', label: 'New', color: '#333333' },
    ],
    routes: [
      { ...route, name: 'Theirs' },
      { ...route, id: 'r2', name: 'New' },
    ],
    starMeta: {
      'hyg:1': { tagIds: ['t2'], customName: 'Theirs', notes: 'Added' },
      'hyg:2': { tagIds: ['t2'] },
    },
    regions: [{ id: 'g1', name: 'New', color: '#444444', systemIds: [] }],
  };

  it('adds what is new and keeps our version of what is shared', () => {
    const merged = mergeWorlds(ours, theirs);
    expect(merged.name).toBe('Ours');
    expect(merged.drive).toEqual(ours.drive);
    expect(merged.tags.map((tag) => tag.label)).toEqual(['Ours', 'New']);
    expect(merged.routes.map((item) => item.name)).toEqual(['Ours', 'New']);
    expect(merged.regions).toHaveLength(1);
    expect(merged.starMeta['hyg:1']).toEqual({
      tagIds: ['t1', 't2'],
      customName: 'Ours',
      notes: 'Added',
    });
    expect(merged.starMeta['hyg:2']).toEqual({ tagIds: ['t2'] });
  });
});

describe('remapWorldIds', () => {
  it('follows the map through every reference', () => {
    const remapped = remapWorldIds(world, {
      'hyg:1': 'hyg:100',
      'sys:a': 'sys:z',
    });
    expect(remapped.starMeta).toEqual({ 'hyg:100': world.starMeta['hyg:1'] });
    expect(remapped.routes[0]?.waypoints).toEqual(['sys:z', 'sys:b', 'sys:c']);
    expect(remapped.regions[0]?.systemIds).toEqual(['sys:z']);
  });

  it('merges notes when two stars become one', () => {
    const two: World = {
      ...newWorld('x'),
      starMeta: {
        'hyg:1': { tagIds: ['t1'], notes: 'kept' },
        'hyg:2': { tagIds: ['t2'], customName: 'Named' },
      },
    };
    expect(remapWorldIds(two, { 'hyg:2': 'hyg:1' }).starMeta).toEqual({
      'hyg:1': { tagIds: ['t1', 't2'], notes: 'kept', customName: 'Named' },
    });
  });

  it('returns the same object when nothing changed', () => {
    expect(remapWorldIds(world, {})).toBe(world);
    expect(remapWorldIds(world, { 'hyg:other': 'hyg:x' })).toBe(world);
  });
});
