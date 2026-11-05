import { del, get, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { mergeWorlds, parseWorld, remapWorldIds } from '../lib/io';
import { movedWaypoints, withoutWaypoint } from '../lib/routes';
import type { Route, StarMeta, Tag, World } from '../types/world';

const STORAGE_KEY = 'stellar-atlas-worlds';
const UNLOAD_KEY = `${STORAGE_KEY}-unload`;
const SAVE_DEBOUNCE_MS = 1000;
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

export const PALETTE = ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc', '#facc15'] as const;

const newId = (prefix: string) => `${prefix}:${crypto.randomUUID()}`;
const nextColor = (count: number) => PALETTE[count % PALETTE.length] ?? PALETTE[0];

export function newWorld(name: string): World {
  return {
    schemaVersion: 1,
    name,
    drive: { type: 'jump', maxJumpLy: 10, daysPerJump: 7 },
    tags: [],
    starMeta: {},
    routes: [],
    regions: [],
  };
}

interface Persisted {
  readonly worldId: string;
  readonly world: World;
  readonly otherWorlds: Readonly<Record<string, World>>; // by ID
}

export interface WorldState extends Persisted {
  readonly past: readonly World[];
  readonly future: readonly World[];
  readonly undo: () => void;
  readonly redo: () => void;
  readonly renameWorld: (name: string) => void;
  readonly createWorld: (name: string) => void;
  readonly switchWorld: (id: string) => void;
  readonly deleteWorld: () => void;
  readonly replaceWorld: (world: World) => void;
  readonly mergeWorld: (world: World) => void;
  readonly remapIds: (idMap: Readonly<Record<string, string>>) => void;
  readonly addRoute: (waypoints: readonly string[]) => string;
  readonly updateRoute: (
    id: string,
    patch: Partial<Omit<Route, 'id' | 'waypoints'>>,
    field?: string,
  ) => void;
  readonly moveWaypoint: (id: string, index: number, step: -1 | 1) => void;
  readonly removeWaypoint: (id: string, index: number) => void;
  readonly deleteRoute: (id: string) => void;
  readonly addTag: (label: string) => string;
  readonly updateTag: (id: string, patch: Partial<Omit<Tag, 'id'>>, field?: string) => void;
  readonly deleteTag: (id: string) => void;
  readonly toggleStarTag: (starId: string, tagId: string) => void;
  readonly setCustomName: (starId: string, name: string) => void;
  readonly setNotes: (starId: string, notes: string) => void;
}

let pendingSave: StorageValue<Persisted> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

async function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  const value = pendingSave;
  pendingSave = null;
  if (!value) return;
  try {
    await idbSet(STORAGE_KEY, value);
    localStorage.removeItem(UNLOAD_KEY);
  } catch (error) {
    console.error('Could not save the world', error);
  }
}

// An IndexedDB write begun as the page goes away gets aborted, so an edit inside the debounce
// window parks in localStorage, which is synchronous, until the next load moves it across.
function parkPendingSave(): void {
  if (!pendingSave) return;
  try {
    localStorage.setItem(UNLOAD_KEY, JSON.stringify(pendingSave));
  } catch (error) {
    console.error('Could not save the world', error);
  }
}

function parkedSave(): StorageValue<Persisted> | null {
  try {
    const parked = localStorage.getItem(UNLOAD_KEY);
    return parked === null ? null : (JSON.parse(parked) as StorageValue<Persisted>);
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', parkPendingSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSave();
  });
}

const storage: PersistStorage<Persisted> = {
  getItem: async (name) => parkedSave() ?? (await get<StorageValue<Persisted>>(name)) ?? null,
  setItem: (_name, value) => {
    pendingSave = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
  },
  removeItem: (name) => del(name),
};

// Never lose a stored world to a failed read: it moves aside rather than being overwritten.
function restored(id: string, raw: unknown): World | null {
  try {
    return parseWorld(raw);
  } catch (error) {
    console.error(`Stored world ${id} is unreadable; keeping it aside`, error);
    void idbSet(`${STORAGE_KEY}-rejected-${id}`, raw).catch(() => undefined);
    return null;
  }
}

function withStarMeta(world: World, starId: string, change: (meta: StarMeta) => StarMeta): World {
  const { [starId]: current, ...rest } = world.starMeta;
  const { tagIds, customName, notes } = change(current ?? { tagIds: [] });
  // Empty values and entries are dropped so that exports stay clean.
  if (tagIds.length === 0 && !customName && !notes) return { ...world, starMeta: rest };
  const next: StarMeta = {
    tagIds,
    ...(customName ? { customName } : {}),
    ...(notes ? { notes } : {}),
  };
  return { ...world, starMeta: { ...rest, [starId]: next } };
}

function withRoute(world: World, id: string, change: (route: Route) => Route): World {
  return {
    ...world,
    routes: world.routes.map((route) => (route.id === id ? change(route) : route)),
  };
}

export const useWorld = create<WorldState>()(
  persist(
    (set, get) => {
      let lastEdit: { readonly field: string; readonly at: number } | null = null;

      // Every world edit goes through here, for undo. Repeated edits of one field (keystrokes, a
      // dragged slider) within a moment of each other make a single undo step.
      const edit = (change: (world: World) => World, field?: string) => {
        const { world, past } = get();
        const next = change(world);
        if (next === world) return;
        const now = Date.now();
        const coalesce =
          field !== undefined &&
          lastEdit?.field === field &&
          now - lastEdit.at < COALESCE_MS &&
          past.length > 0;
        lastEdit = field === undefined ? null : { field, at: now };
        set(
          coalesce
            ? { world: next }
            : { world: next, past: [...past, world].slice(-HISTORY_LIMIT), future: [] },
        );
      };

      return {
        worldId: newId('world'),
        world: newWorld('My world'),
        otherWorlds: {},
        past: [],
        future: [],

        undo: () => {
          lastEdit = null;
          const { world, past, future } = get();
          const previous = past.at(-1);
          if (previous)
            set({ world: previous, past: past.slice(0, -1), future: [world, ...future] });
        },
        redo: () => {
          lastEdit = null;
          const { world, past, future } = get();
          const next = future[0];
          if (next) set({ world: next, past: [...past, world], future: future.slice(1) });
        },

        renameWorld: (name) => edit((world) => ({ ...world, name }), 'world-name'),
        createWorld: (name) => {
          const { worldId, world, otherWorlds } = get();
          lastEdit = null;
          set({
            worldId: newId('world'),
            world: newWorld(name),
            otherWorlds: { ...otherWorlds, [worldId]: world },
            past: [],
            future: [],
          });
        },
        switchWorld: (id) => {
          const { worldId, world, otherWorlds } = get();
          const { [id]: target, ...rest } = otherWorlds;
          if (!target) return;
          lastEdit = null;
          set({
            worldId: id,
            world: target,
            otherWorlds: { ...rest, [worldId]: world },
            past: [],
            future: [],
          });
        },
        // Switches to the next world; the last one left can't go.
        deleteWorld: () => {
          const { otherWorlds } = get();
          const [first, ...rest] = Object.entries(otherWorlds);
          if (!first) return;
          lastEdit = null;
          set({
            worldId: first[0],
            world: first[1],
            otherWorlds: Object.fromEntries(rest),
            past: [],
            future: [],
          });
        },
        replaceWorld: (world) => edit(() => world),
        mergeWorld: (incoming) => edit((world) => mergeWorlds(world, incoming)),
        // Not an edit: it only keeps up with the catalogue, so there is nothing to undo.
        remapIds: (idMap) => {
          const { world, otherWorlds } = get();
          set({
            world: remapWorldIds(world, idMap),
            otherWorlds: Object.fromEntries(
              Object.entries(otherWorlds).map(([id, other]) => [id, remapWorldIds(other, idMap)]),
            ),
          });
        },

        addRoute: (waypoints) => {
          const id = newId('route');
          edit((world) => ({
            ...world,
            routes: [
              ...world.routes,
              {
                id,
                waypoints,
                kind: 'trade',
                color: nextColor(world.routes.length),
                dashed: false,
                width: 2,
              },
            ],
          }));
          return id;
        },
        updateRoute: (id, patch, field) =>
          edit(
            (world) => withRoute(world, id, (route) => ({ ...route, ...patch })),
            field && `route:${id}:${field}`,
          ),
        moveWaypoint: (id, index, step) =>
          edit((world) =>
            withRoute(world, id, (route) => {
              const waypoints = movedWaypoints(route.waypoints, index, step);
              return waypoints ? { ...route, waypoints } : route;
            }),
          ),
        removeWaypoint: (id, index) =>
          edit((world) =>
            withRoute(world, id, (route) => {
              const waypoints = withoutWaypoint(route.waypoints, index);
              return waypoints ? { ...route, waypoints } : route;
            }),
          ),
        deleteRoute: (id) =>
          edit((world) => ({
            ...world,
            routes: world.routes.filter((route) => route.id !== id),
          })),

        addTag: (label) => {
          const id = newId('tag');
          edit((world) => ({
            ...world,
            tags: [...world.tags, { id, label, color: nextColor(world.tags.length) }],
          }));
          return id;
        },
        updateTag: (id, patch, field) =>
          edit(
            (world) => ({
              ...world,
              tags: world.tags.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)),
            }),
            field && `tag:${id}:${field}`,
          ),
        deleteTag: (id) =>
          edit((world) => {
            let next: World = { ...world, tags: world.tags.filter((tag) => tag.id !== id) };
            for (const [starId, meta] of Object.entries(world.starMeta)) {
              if (!meta.tagIds.includes(id)) continue;
              next = withStarMeta(next, starId, (current) => ({
                ...current,
                tagIds: current.tagIds.filter((tagId) => tagId !== id),
              }));
            }
            return next;
          }),
        toggleStarTag: (starId, tagId) =>
          edit((world) =>
            withStarMeta(world, starId, (meta) => ({
              ...meta,
              tagIds: meta.tagIds.includes(tagId)
                ? meta.tagIds.filter((id) => id !== tagId)
                : [...meta.tagIds, tagId],
            })),
          ),
        setCustomName: (starId, name) =>
          edit(
            (world) => withStarMeta(world, starId, (meta) => ({ ...meta, customName: name })),
            `star:${starId}:name`,
          ),
        setNotes: (starId, notes) =>
          edit(
            (world) => withStarMeta(world, starId, (meta) => ({ ...meta, notes })),
            `star:${starId}:notes`,
          ),
      };
    },
    {
      name: STORAGE_KEY,
      storage,
      partialize: ({ worldId, world, otherWorlds }) => ({ worldId, world, otherWorlds }),
      merge: (stored, current) => {
        if (!stored) return current;
        const { worldId, world, otherWorlds } = stored as Persisted;
        const active = restored(worldId, world);
        const others = Object.entries(otherWorlds).flatMap(([id, raw]) => {
          const other = restored(id, raw);
          return other ? [[id, other] as const] : [];
        });
        return {
          ...current,
          ...(active ? { worldId, world: active } : {}),
          otherWorlds: Object.fromEntries(others),
        };
      },
    },
  ),
);
