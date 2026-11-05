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

// The system open in the detail modal; starId null shows its primary.
export interface Detail {
  readonly systemId: string;
  readonly starId: string | null;
}

// Viewport coordinates of the pointer over a star.
export interface StarHover {
  readonly starId: string;
  readonly x: number;
  readonly y: number;
}

export type Tool = 'none' | 'route' | 'ruler';
export type Panel = 'routes' | 'world';

interface UiState {
  readonly filters: StarFilters;
  readonly overlays: Overlays;
  readonly orbitStarId: string | null; // null once the view has been panned off a star
  readonly flyRequest: FlyRequest | null;
  readonly selectedSystemIds: readonly string[]; // in selection order
  readonly detail: Detail | null;
  readonly hover: StarHover | null;
  readonly labelCount: number;
  readonly tool: Tool;
  readonly routeDraft: readonly string[]; // system IDs, in order
  readonly rulerStarIds: readonly string[]; // up to two
  readonly panel: Panel | null;
  readonly expandedRouteId: string | null;
  readonly hiddenRouteIds: readonly string[]; // this session's view, not part of the world
  readonly setFilters: (patch: Partial<StarFilters>) => void;
  readonly toggleClass: (cls: SpectralClass) => void;
  readonly toggleOverlay: (overlay: keyof Overlays) => void;
  readonly flyToStar: (starId: string) => void;
  readonly flyHome: () => void;
  readonly clearOrbitStar: () => void;
  readonly select: (systemId: string, starId?: string | null) => void;
  readonly toggleSelect: (systemId: string, starId?: string | null) => void;
  readonly clearSelection: () => void;
  readonly showStar: (starId: string) => void;
  readonly closeDetail: () => void;
  readonly setHover: (hover: StarHover | null) => void;
  readonly setLabelCount: (count: number) => void;
  readonly startRoute: (systemId?: string) => void;
  readonly addWaypoint: (systemId: string) => void;
  readonly removeLastWaypoint: () => void;
  readonly startRuler: () => void;
  readonly pickRulerStar: (starId: string) => void;
  readonly endTool: () => void;
  readonly togglePanel: (panel: Panel) => void;
  readonly showRoute: (routeId: string | null) => void;
  readonly toggleRouteHidden: (routeId: string) => void;
}

export const useUi = create<UiState>()((set) => ({
  filters: DEFAULT_FILTERS,
  overlays: { grid: true, rings: true, dropLines: true },
  orbitStarId: SOL_ID,
  flyRequest: null,
  selectedSystemIds: [],
  detail: null,
  hover: null,
  labelCount: 0,
  tool: 'none',
  routeDraft: [],
  rulerStarIds: [],
  panel: null,
  expandedRouteId: null,
  hiddenRouteIds: [],
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
  select: (systemId, starId = null) =>
    set({ selectedSystemIds: [systemId], detail: { systemId, starId } }),
  // Shift-click: adding shows the new system; removing the shown one falls back to the latest.
  toggleSelect: (systemId, starId = null) =>
    set((state) => {
      if (!state.selectedSystemIds.includes(systemId)) {
        return {
          selectedSystemIds: [...state.selectedSystemIds, systemId],
          detail: { systemId, starId },
        };
      }
      const selectedSystemIds = state.selectedSystemIds.filter((id) => id !== systemId);
      if (state.detail?.systemId !== systemId) return { selectedSystemIds };
      const latest = selectedSystemIds.at(-1);
      return {
        selectedSystemIds,
        detail: latest === undefined ? null : { systemId: latest, starId: null },
      };
    }),
  clearSelection: () => set({ selectedSystemIds: [], detail: null }),
  showStar: (starId) =>
    set((state) => (state.detail ? { detail: { ...state.detail, starId } } : {})),
  closeDetail: () => set({ detail: null }),
  setHover: (hover) => set({ hover }),
  setLabelCount: (labelCount) => set({ labelCount }),
  // Clicks now pick waypoints, so the modal gets out of the way.
  startRoute: (systemId) =>
    set({
      tool: 'route',
      routeDraft: systemId === undefined ? [] : [systemId],
      rulerStarIds: [],
      detail: null,
    }),
  // A second click on the same system, as in a double-click, isn't a leg.
  addWaypoint: (systemId) =>
    set((state) =>
      state.routeDraft.at(-1) === systemId ? {} : { routeDraft: [...state.routeDraft, systemId] },
    ),
  removeLastWaypoint: () => set((state) => ({ routeDraft: state.routeDraft.slice(0, -1) })),
  startRuler: () => set({ tool: 'ruler', routeDraft: [], rulerStarIds: [], detail: null }),
  // A third star starts a new measurement.
  pickRulerStar: (starId) =>
    set(({ rulerStarIds }) => {
      const [first, second] = rulerStarIds;
      if (first === undefined || second !== undefined) return { rulerStarIds: [starId] };
      return first === starId ? {} : { rulerStarIds: [first, starId] };
    }),
  endTool: () => set({ tool: 'none', routeDraft: [], rulerStarIds: [] }),
  togglePanel: (panel) => set((state) => ({ panel: state.panel === panel ? null : panel })),
  showRoute: (expandedRouteId) =>
    set(expandedRouteId === null ? { expandedRouteId } : { expandedRouteId, panel: 'routes' }),
  toggleRouteHidden: (routeId) =>
    set(({ hiddenRouteIds }) => ({
      hiddenRouteIds: hiddenRouteIds.includes(routeId)
        ? hiddenRouteIds.filter((id) => id !== routeId)
        : [...hiddenRouteIds, routeId],
    })),
}));
