import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseWorld } from '../../../src/lib/io';
import { newWorld, useWorld } from '../../../src/store/world';

const initial = useWorld.getState();
const world = () => useWorld.getState().world;
const actions = () => useWorld.getState();

beforeEach(() => {
  useWorld.setState({
    ...initial,
    world: newWorld('Test'),
    otherWorlds: {},
    past: [],
    future: [],
  });
  actions().undo(); // clears the coalescing memory left by the last test
});

afterEach(() => {
  vi.useRealTimers();
});

describe('routes', () => {
  it('adds a route with defaults and edits every field', () => {
    const id = actions().addRoute(['a', 'b', 'c']);
    expect(world().routes[0]).toMatchObject({ id, waypoints: ['a', 'b', 'c'], kind: 'trade' });

    actions().updateRoute(id, {
      name: 'Spine',
      kind: 'exploration',
      color: '#123456',
      dashed: true,
      width: 4,
      notes: 'Long way',
    });
    expect(world().routes[0]).toMatchObject({
      name: 'Spine',
      kind: 'exploration',
      color: '#123456',
      dashed: true,
      width: 4,
      notes: 'Long way',
    });
  });

  it('reorders and removes waypoints but keeps at least two', () => {
    const id = actions().addRoute(['a', 'b', 'c']);
    actions().moveWaypoint(id, 0, 1);
    expect(world().routes[0]?.waypoints).toEqual(['b', 'a', 'c']);
    actions().removeWaypoint(id, 1);
    expect(world().routes[0]?.waypoints).toEqual(['b', 'c']);
    actions().removeWaypoint(id, 1);
    expect(world().routes[0]?.waypoints).toEqual(['b', 'c']);
  });

  it('deletes a route', () => {
    const id = actions().addRoute(['a', 'b']);
    actions().deleteRoute(id);
    expect(world().routes).toEqual([]);
  });
});

describe('drive model', () => {
  it('defaults to the jump drive, and an edit can be undone', () => {
    expect(world().drive.type).toBe('jump');
    actions().setDrive({ type: 'ftl-speed', multipleOfC: 50 });
    expect(world().drive).toEqual({ type: 'ftl-speed', multipleOfC: 50 });
    actions().undo();
    expect(world().drive.type).toBe('jump');
  });

  it('makes one undo step of repeated edits to a field', () => {
    actions().setDrive({ type: 'jump', maxJumpLy: 11, daysPerJump: 7 }, 'maxJumpLy');
    actions().setDrive({ type: 'jump', maxJumpLy: 12, daysPerJump: 7 }, 'maxJumpLy');
    actions().undo();
    expect(world().drive).toEqual({ type: 'jump', maxJumpLy: 10, daysPerJump: 7 });
  });

  it('survives the world schema, whichever model is set', () => {
    for (const drive of [
      { type: 'sublight', fractionC: 0.1, accelG: 1 },
      { type: 'sublight', fractionC: 0.1 },
      { type: 'ftl-speed', multipleOfC: 50 },
    ] as const) {
      actions().setDrive(drive);
      expect(parseWorld(world()).drive).toEqual(drive);
    }
  });
});

describe('tags and star meta', () => {
  it('toggles a tag on and drops the entry once the star is bare', () => {
    const tag = actions().addTag('Colonised');
    actions().toggleStarTag('s', tag);
    expect(world().starMeta['s']?.tagIds).toEqual([tag]);
    actions().toggleStarTag('s', tag);
    expect(world().starMeta['s']).toBeUndefined();
  });

  it('removes a deleted tag from every star, keeping their other details', () => {
    const tag = actions().addTag('Doomed');
    actions().toggleStarTag('s1', tag);
    actions().toggleStarTag('s2', tag);
    actions().setNotes('s2', 'stays');
    actions().deleteTag(tag);
    expect(world().tags).toEqual([]);
    expect(world().starMeta).toEqual({ s2: { tagIds: [], notes: 'stays' } });
  });

  it('clears a custom name when emptied', () => {
    actions().setCustomName('s', 'Haven');
    expect(world().starMeta['s']).toEqual({ tagIds: [], customName: 'Haven' });
    actions().setCustomName('s', '');
    expect(world().starMeta['s']).toBeUndefined();
  });

  it('gives tags different colours until the palette runs out', () => {
    actions().addTag('One');
    actions().addTag('Two');
    expect(world().tags[0]?.color).not.toBe(world().tags[1]?.color);
  });
});

describe('undo and redo', () => {
  it('walks back and forward through edits', () => {
    actions().addRoute(['a', 'b']);
    actions().setNotes('s', 'hello');
    actions().undo();
    expect(world().starMeta).toEqual({});
    expect(world().routes).toHaveLength(1);
    actions().undo();
    expect(world().routes).toHaveLength(0);
    actions().redo();
    actions().redo();
    expect(world().routes).toHaveLength(1);
    expect(world().starMeta['s']?.notes).toBe('hello');
  });

  it('forgets the redo branch on a new edit', () => {
    actions().addRoute(['a', 'b']);
    actions().undo();
    actions().addTag('Fresh');
    actions().redo();
    expect(world().routes).toHaveLength(0);
    expect(useWorld.getState().future).toEqual([]);
  });

  it('does nothing at either end of the history', () => {
    const before = world();
    actions().undo();
    actions().redo();
    expect(world()).toBe(before);
  });

  it('keeps the last 100 steps', () => {
    for (let i = 0; i < 120; i++) actions().addTag(`Tag ${i}`);
    expect(useWorld.getState().past).toHaveLength(100);
    for (let i = 0; i < 150; i++) actions().undo();
    expect(world().tags).toHaveLength(20);
  });

  it('makes one step of a burst of keystrokes, and a new one after a pause', () => {
    vi.useFakeTimers();
    actions().setNotes('s', 'h');
    vi.advanceTimersByTime(100);
    actions().setNotes('s', 'he');
    vi.advanceTimersByTime(100);
    actions().setNotes('s', 'hey');
    expect(useWorld.getState().past).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    actions().setNotes('s', 'hey there');
    expect(useWorld.getState().past).toHaveLength(2);
    actions().undo();
    expect(world().starMeta['s']?.notes).toBe('hey');
    actions().undo();
    expect(world().starMeta['s']).toBeUndefined();
  });

  it('keeps edits of different fields as separate steps', () => {
    actions().setNotes('s', 'a');
    actions().setCustomName('s', 'b');
    expect(useWorld.getState().past).toHaveLength(2);
  });

  it('undoes an import', () => {
    actions().addTag('Ours');
    actions().replaceWorld(newWorld('Imported'));
    expect(world().name).toBe('Imported');
    actions().undo();
    expect(world().name).toBe('Test');
    expect(world().tags).toHaveLength(1);
  });
});

describe('named worlds', () => {
  it('creates, switches and keeps each world separate, with its own history', () => {
    actions().addTag('First');
    const firstId = useWorld.getState().worldId;
    actions().createWorld('Second');
    expect(world().name).toBe('Second');
    expect(world().tags).toEqual([]);
    expect(useWorld.getState().past).toEqual([]);

    actions().switchWorld(firstId);
    expect(world().name).toBe('Test');
    expect(world().tags).toHaveLength(1);
    expect(Object.values(useWorld.getState().otherWorlds).map((w) => w.name)).toEqual(['Second']);
  });

  it('ignores a switch to an unknown world', () => {
    const before = world();
    actions().switchWorld('world:none');
    expect(world()).toBe(before);
  });

  it('deletes the active world in favour of another, but never the last', () => {
    actions().deleteWorld();
    expect(world().name).toBe('Test');
    actions().createWorld('Second');
    actions().deleteWorld();
    expect(world().name).toBe('Test');
    expect(useWorld.getState().otherWorlds).toEqual({});
  });
});

describe('remapIds', () => {
  it('rewrites every world without adding an undo step', () => {
    actions().setNotes('old', 'kept');
    actions().createWorld('Second');
    actions().setNotes('old', 'also');
    const pastBefore = useWorld.getState().past.length;
    actions().remapIds({ old: 'new' });
    expect(world().starMeta['new']?.notes).toBe('also');
    expect(Object.values(useWorld.getState().otherWorlds)[0]?.starMeta['new']?.notes).toBe('kept');
    expect(useWorld.getState().past).toHaveLength(pastBefore);
  });
});

describe('saving across a reload', () => {
  it('parks an unsaved edit when the page goes away, and restores it first', async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
    try {
      actions().renameWorld('Unsaved');
      window.dispatchEvent(new Event('pagehide'));
      expect([...stored.values()].join()).toContain('Unsaved');

      useWorld.setState({ world: newWorld('Stale') });
      await useWorld.persist.rehydrate();
      expect(world().name).toBe('Unsaved');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('regions', () => {
  it('creates, edits and deletes a region, each an undo step', () => {
    const id = actions().addRegion('Hegemony');
    expect(world().regions).toEqual([
      { id, name: 'Hegemony', color: expect.stringMatching(/^#/), systemIds: [] },
    ]);
    actions().updateRegion(id, { name: 'League', color: '#123456' });
    expect(world().regions[0]).toMatchObject({ name: 'League', color: '#123456' });
    actions().deleteRegion(id);
    expect(world().regions).toEqual([]);
    actions().undo();
    expect(world().regions[0]?.name).toBe('League');
  });

  it('gives each new region its own colour', () => {
    actions().addRegion('A');
    actions().addRegion('B');
    expect(world().regions[0]?.color).not.toBe(world().regions[1]?.color);
  });

  it('toggles a system in and out, and adds a selection without duplicates', () => {
    const id = actions().addRegion('Core');
    actions().toggleSystemRegion('sys:a', id);
    expect(world().regions[0]?.systemIds).toEqual(['sys:a']);
    actions().addSystemsToRegion(id, ['sys:a', 'sys:b']);
    expect(world().regions[0]?.systemIds).toEqual(['sys:a', 'sys:b']);
    actions().toggleSystemRegion('sys:a', id);
    expect(world().regions[0]?.systemIds).toEqual(['sys:b']);
  });

  it('leaves other regions alone, and a world with regions still validates', () => {
    const first = actions().addRegion('A');
    actions().addRegion('B');
    actions().toggleSystemRegion('sys:a', first);
    expect(world().regions[1]?.systemIds).toEqual([]);
    expect(parseWorld(world())).toEqual(world());
  });
});
