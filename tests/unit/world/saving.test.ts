import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A write that stays under way until the test says otherwise.
const writes = vi.hoisted(() => ({ finish: [] as (() => void)[] }));
vi.mock('idb-keyval', () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  del: vi.fn(() => Promise.resolve()),
  set: vi.fn(() => new Promise<void>((resolve) => writes.finish.push(resolve))),
}));

const { useWorld } = await import('../../../src/store/world');

const UNLOAD_KEY = 'stellar-atlas-worlds-unload';
const parked = new Map<string, string>();

function parkedName(): string | undefined {
  const value = parked.get(UNLOAD_KEY);
  return value === undefined
    ? undefined
    : (JSON.parse(value) as { state: { world: { name: string } } }).state.world.name;
}

beforeEach(() => {
  vi.useFakeTimers();
  parked.clear();
  writes.finish.length = 0;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => parked.get(key) ?? null,
    setItem: (key: string, value: string) => parked.set(key, value),
    removeItem: (key: string) => parked.delete(key),
  });
});

afterEach(async () => {
  writes.finish.forEach((finish) => finish());
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('leaving the page while saving', () => {
  it('parks an edit whose write is still under way, as the page going aborts it', () => {
    useWorld.getState().renameWorld('Mid-write');
    vi.advanceTimersByTime(1000); // the debounce ends, and the write begins
    expect(writes.finish).toHaveLength(1);
    window.dispatchEvent(new Event('pagehide'));
    expect(parkedName()).toBe('Mid-write');
  });

  it('has nothing to park once the write has finished', async () => {
    useWorld.getState().renameWorld('Written');
    vi.advanceTimersByTime(1000);
    writes.finish[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('pagehide'));
    expect(parkedName()).toBeUndefined();
  });

  it('keeps a newer edit pending when an older write finishes', async () => {
    useWorld.getState().renameWorld('Older');
    vi.advanceTimersByTime(1000);
    useWorld.getState().renameWorld('Newer');
    writes.finish[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event('pagehide'));
    expect(parkedName()).toBe('Newer');
  });
});
