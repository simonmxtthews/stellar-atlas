import { create } from 'zustand';
import type { Star, StarSystem } from '../types/catalogue';

export interface Catalogue {
  readonly stars: readonly Star[];
  readonly systems: readonly StarSystem[];
  readonly systemsById: ReadonlyMap<string, StarSystem>;
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
    ]).then(
      ([stars, systems]) => {
        const systemsById = new Map(systems.map((system) => [system.id, system]));
        set({ catalogue: { stars, systems, systemsById } });
      },
      (error: unknown) => {
        set({ error: error instanceof Error ? error.message : String(error) });
      },
    );
    return pending;
  },
}));
