import { create } from 'zustand';
import type { Planet, Star, StarSystem } from '../types/catalogue';

export interface Catalogue {
  readonly stars: readonly Star[];
  readonly systems: readonly StarSystem[];
  readonly starsById: ReadonlyMap<string, Star>;
  readonly starIndexById: ReadonlyMap<string, number>; // index into stars and the scene attributes
  readonly systemsById: ReadonlyMap<string, StarSystem>;
  readonly planetsById: ReadonlyMap<string, Planet>;
  readonly idMap?: Readonly<Record<string, string>>; // meta.json: IDs that changed in a rebuild
}

interface CatalogueState {
  readonly catalogue: Catalogue | null;
  readonly error: string | null;
  readonly load: () => Promise<void>;
}

async function fetchJson<T>(file: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

let pending: Promise<void> | null = null;

export const useCatalogue = create<CatalogueState>()((set) => ({
  catalogue: null,
  error: null,
  load: () => {
    pending ??= Promise.all([
      fetchJson<readonly Star[]>('stars.json'),
      fetchJson<readonly StarSystem[]>('systems.json'),
      fetchJson<readonly Planet[]>('planets.json'),
      fetchJson<{ readonly idMap?: Readonly<Record<string, string>> }>('meta.json'),
    ]).then(
      ([stars, systems, planets, meta]) => {
        set({
          catalogue: {
            stars,
            systems,
            starsById: new Map(stars.map((star) => [star.id, star])),
            starIndexById: new Map(stars.map((star, i) => [star.id, i])),
            systemsById: new Map(systems.map((system) => [system.id, system])),
            planetsById: new Map(planets.map((planet) => [planet.id, planet])),
            idMap: meta.idMap ?? {},
          },
        });
      },
      (error: unknown) => {
        set({ error: error instanceof Error ? error.message : String(error) });
      },
    );
    return pending;
  },
}));
