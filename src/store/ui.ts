import { create } from 'zustand';
import { DEFAULT_FILTERS, SOL_ID, type StarFilters } from '../lib/filters';
import type { SpectralClass } from '../types/catalogue';

// A fresh object per request, so repeating the same request flies again.
export type FlyRequest =
  { readonly kind: 'home' } | { readonly kind: 'star'; readonly starId: string };

export interface Overlays {
  readonly grid: boolean;
  readonly rings: boolean;
  readonly dropLines: boolean;
}

interface UiState {
  readonly filters: StarFilters;
  readonly overlays: Overlays;
  readonly orbitStarId: string | null; // null once the view has been panned off a star
  readonly flyRequest: FlyRequest | null;
  readonly setFilters: (patch: Partial<StarFilters>) => void;
  readonly toggleClass: (cls: SpectralClass) => void;
  readonly toggleOverlay: (overlay: keyof Overlays) => void;
  readonly flyToStar: (starId: string) => void;
  readonly flyHome: () => void;
  readonly clearOrbitStar: () => void;
}

export const useUi = create<UiState>()((set) => ({
  filters: DEFAULT_FILTERS,
  overlays: { grid: true, rings: true, dropLines: true },
  orbitStarId: SOL_ID,
  flyRequest: null,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  toggleClass: (cls) =>
    set((state) => {
      const { hiddenClasses } = state.filters;
      return {
        filters: {
          ...state.filters,
          hiddenClasses: hiddenClasses.includes(cls)
            ? hiddenClasses.filter((hidden) => hidden !== cls)
            : [...hiddenClasses, cls],
        },
      };
    }),
  toggleOverlay: (overlay) =>
    set((state) => ({ overlays: { ...state.overlays, [overlay]: !state.overlays[overlay] } })),
  flyToStar: (starId) => set({ flyRequest: { kind: 'star', starId }, orbitStarId: starId }),
  flyHome: () => set({ flyRequest: { kind: 'home' }, orbitStarId: SOL_ID }),
  clearOrbitStar: () => set({ orbitStarId: null }),
}));
