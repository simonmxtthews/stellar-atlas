import { useEffect } from 'react';
import { isTypingTarget } from '../lib/keys';
import { distanceLy, routeLegs, routeLengthLy } from '../lib/routes';
import { formatValue } from '../lib/starFacts';
import { formatTravelTime, routeTravelTime, systemTravelTime } from '../lib/travel';
import type { Catalogue } from '../store/catalogue';
import { useUi, type Panel, type Tool } from '../store/ui';
import { useWorld } from '../store/world';
import { AboutPanel } from './AboutPanel';
import { BUTTON_CLASS, PANEL_CLASS, QUIET_BUTTON_CLASS } from './controlStyles';
import type { StarSystem } from '../types/catalogue';
import { NetworkPanel } from './NetworkPanel';
import { ProbesPanel } from './ProbesPanel';
import { RoutePanel } from './RoutePanel';
import { TravelCalculator } from './TravelCalculator';
import { autoRoutePath, useAutoRoutePath } from './useAutoRoute';
import { WorldPanel } from './WorldPanel';

const SURFACE_CLASS = `${PANEL_CLASS} p-3`;

const PANELS: readonly (readonly [Panel, string, string])[] = [
  ['routes', 'Routes', 'Route panel'],
  ['world', 'World', 'World panel'],
  ['drive', 'Drive', 'Drive panel'],
  ['network', 'Network', 'Network panel'],
  ['probes', 'Probes', 'Probes panel'],
  ['about', 'About', 'About panel'],
];

// Each tool: its id, label, shortcut key and how to start it.
const TOOLS: readonly (readonly [
  Exclude<Tool, 'none'>,
  string,
  string,
  (state: ReturnType<typeof useUi.getState>) => void,
])[] = [
  ['route', 'Route', 'R', (state) => state.startRoute()],
  ['ruler', 'Ruler', 'M', (state) => state.startRuler()],
  ['autoroute', 'Auto-route', 'A', (state) => state.startAutoRoute()],
];

// The row's buttons, all one height, so the row matches the search box beside it.
// A touch tighter below 1280 px, so the row still fits on one line at 1024.
const TOOL_BUTTON_CLASS = `${QUIET_BUTTON_CLASS} inline-flex h-7 items-center whitespace-nowrap max-xl:px-1.5`;
const ICON_BUTTON_CLASS = `${QUIET_BUTTON_CLASS} grid h-7 w-7 place-items-center px-0`;
const DIVIDER_CLASS = 'mx-1 h-4 w-px bg-line';

function UndoIcon({ flipped = false }: { readonly flipped?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={`size-3.5 ${flipped ? '-scale-x-100' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 3.5 2.5 6.5l3 3" />
      <path d="M2.5 6.5h7a4 4 0 0 1 0 8H7" />
    </svg>
  );
}

function saveAutoRoute(path: readonly string[] | null): void {
  if (!path) return;
  const { endTool, showRoute } = useUi.getState();
  const id = useWorld.getState().addRoute(path);
  endTool();
  showRoute(id);
}

function saveDraft(): void {
  const { routeDraft, endTool, showRoute } = useUi.getState();
  if (routeDraft.length < 2) return;
  const id = useWorld.getState().addRoute(routeDraft);
  endTool();
  showRoute(id);
}

function RouteBanner({ catalogue }: { readonly catalogue: Catalogue }) {
  const routeDraft = useUi((state) => state.routeDraft);
  const removeLastWaypoint = useUi((state) => state.removeLastWaypoint);
  const endTool = useUi((state) => state.endTool);
  const drive = useWorld((state) => state.world.drive);
  const legs = routeLegs(routeDraft, catalogue.systemsById);
  const names = routeDraft.map((id) => catalogue.systemsById.get(id)?.name ?? id);
  return (
    <div role="status" aria-label="Route mode" className={SURFACE_CLASS}>
      <p data-testid="route-draft" className="text-xs">
        {names.length === 0 ? 'Click systems in order to add waypoints.' : names.join(' → ')}
      </p>
      <p className="mt-1 text-xs text-muted tabular-nums">
        {routeDraft.length} waypoint{routeDraft.length === 1 ? '' : 's'} ·{' '}
        {formatValue(routeLengthLy(legs), 2, 'ly')}
        {legs.length > 0 &&
          ` · ${formatTravelTime(routeTravelTime(drive, catalogue.systems, legs))}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          disabled={routeDraft.length < 2}
          onClick={saveDraft}
          className={BUTTON_CLASS}
        >
          Save (Enter)
        </button>
        <button
          type="button"
          disabled={routeDraft.length === 0}
          onClick={removeLastWaypoint}
          className={BUTTON_CLASS}
        >
          Remove last (Backspace)
        </button>
        <button type="button" onClick={endTool} className={BUTTON_CLASS}>
          Cancel (Esc)
        </button>
      </div>
    </div>
  );
}

function RulerBanner({ catalogue }: { readonly catalogue: Catalogue }) {
  const rulerStarIds = useUi((state) => state.rulerStarIds);
  const endTool = useUi((state) => state.endTool);
  const drive = useWorld((state) => state.world.drive);
  const [from, to] = rulerStarIds.map((id) => catalogue.starsById.get(id));
  const measured = from && to ? distanceLy(from.pos, to.pos) : 0;
  return (
    <div role="status" aria-label="Ruler" className={SURFACE_CLASS}>
      <p data-testid="ruler-readout" className="text-xs tabular-nums">
        {from && to
          ? `${from.displayName} → ${to.displayName}: ${formatValue(measured, 2, 'ly')} · ${formatTravelTime(
              systemTravelTime(drive, catalogue.systems, from.systemId, to.systemId, measured),
            )}`
          : from
            ? `${from.displayName} → pick a second star`
            : 'Pick two stars to measure between them.'}
      </p>
      <button type="button" onClick={endTool} className={`${BUTTON_CLASS} mt-2`}>
        Done (Esc)
      </button>
    </div>
  );
}

function AutoRouteBanner({
  catalogue,
  visibleSystems,
}: {
  readonly catalogue: Catalogue;
  readonly visibleSystems: readonly StarSystem[];
}) {
  const autoRouteIds = useUi((state) => state.autoRouteIds);
  const endTool = useUi((state) => state.endTool);
  const drive = useWorld((state) => state.world.drive);
  const path = useAutoRoutePath(catalogue, visibleSystems);
  const [start, end] = autoRouteIds.map((id) => catalogue.systemsById.get(id)?.name ?? id);
  const legs = routeLegs(path ?? [], catalogue.systemsById);
  return (
    <div role="status" aria-label="Auto-route" className={SURFACE_CLASS}>
      <p data-testid="auto-route-plan" className="text-xs">
        {drive.type !== 'jump'
          ? 'Auto-route follows the jump network, so it needs a jump drive.'
          : !start
            ? 'Pick a start system, then an end system.'
            : !end
              ? `${start} → pick an end system`
              : !path
                ? `No chain of jumps links ${start} to ${end} through the visible systems.`
                : path.map((id) => catalogue.systemsById.get(id)?.name ?? id).join(' → ')}
      </p>
      {path && (
        <p data-testid="auto-route-total" className="mt-1 text-xs text-muted tabular-nums">
          {formatValue(routeLengthLy(legs), 2, 'ly')} ·{' '}
          {formatTravelTime(routeTravelTime(drive, catalogue.systems, legs))}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          disabled={!path}
          onClick={() => saveAutoRoute(path)}
          className={BUTTON_CLASS}
        >
          Save route (Enter)
        </button>
        <button type="button" onClick={endTool} className={BUTTON_CLASS}>
          Cancel (Esc)
        </button>
      </div>
    </div>
  );
}

export function Toolbar({
  catalogue,
  visibleSystems,
}: {
  readonly catalogue: Catalogue;
  readonly visibleSystems: readonly StarSystem[];
}) {
  const tool = useUi((state) => state.tool);
  const panel = useUi((state) => state.panel);
  const endTool = useUi((state) => state.endTool);
  const togglePanel = useUi((state) => state.togglePanel);
  const undo = useWorld((state) => state.undo);
  const redo = useWorld((state) => state.redo);
  const canUndo = useWorld((state) => state.past.length > 0);
  const canRedo = useWorld((state) => state.future.length > 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key !== 'z' && key !== 'y') return;
        event.preventDefault();
        const { undo: undoEdit, redo: redoEdit } = useWorld.getState();
        if (key === 'y' || event.shiftKey) redoEdit();
        else undoEdit();
        return;
      }
      if (event.altKey) return;
      const state = useUi.getState();
      // The tools work through their banners, so starting one brings a hidden interface back.
      if (key === 'r' || key === 'm' || key === 'a') state.setChromeHidden(false);
      if (key === 'r') {
        if (state.tool === 'route') state.endTool();
        else state.startRoute();
      } else if (key === 'm') {
        if (state.tool === 'ruler') state.endTool();
        else state.startRuler();
      } else if (key === 'a') {
        if (state.tool === 'autoroute') state.endTool();
        else state.startAutoRoute();
      } else if (state.tool === 'autoroute' && key === 'enter') {
        event.preventDefault();
        const { drive } = useWorld.getState().world;
        saveAutoRoute(autoRoutePath(catalogue, visibleSystems, state.autoRouteIds, drive));
      } else if (state.tool === 'route' && key === 'enter') {
        event.preventDefault(); // or it also presses whichever button has focus
        saveDraft();
      } else if (state.tool === 'route' && key === 'backspace') {
        event.preventDefault();
        state.removeLastWaypoint();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [catalogue, visibleSystems]);

  return (
    // One row the height of the search box, from the rail's edge; panels and banners drop below it,
    // level with the rail. Below 1024 px there isn't room, so it wraps into two.
    <div className="absolute top-3 left-[17.5rem] z-5 flex max-h-[calc(100dvh-1.5rem)] w-[26rem] flex-col gap-3 lg:left-[18.5rem] lg:w-auto lg:max-w-[calc(100vw-22.5rem)] max-md:inset-x-3 max-md:top-[4.125rem] max-md:max-h-[calc(100dvh-16rem)] max-md:w-auto max-md:gap-2">
      <div
        role="toolbar"
        aria-label="World tools"
        className={`${PANEL_CLASS} flex shrink-0 flex-wrap items-center gap-0.5 self-start p-1 max-lg:self-stretch`}
      >
        {TOOLS.map(([id, label, key, start]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tool === id}
            aria-keyshortcuts={key}
            title={`${label} (${key})`}
            onClick={() => (tool === id ? endTool() : start(useUi.getState()))}
            className={TOOL_BUTTON_CLASS}
          >
            {label}
            <kbd aria-hidden className="ml-1.5 border-line text-faint">
              {key}
            </kbd>
          </button>
        ))}
        <span aria-hidden className={DIVIDER_CLASS} />
        <button
          type="button"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          aria-keyshortcuts="Control+Z"
          disabled={!canUndo}
          onClick={undo}
          className={ICON_BUTTON_CLASS}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          aria-keyshortcuts="Control+Shift+Z"
          disabled={!canRedo}
          onClick={redo}
          className={ICON_BUTTON_CLASS}
        >
          <UndoIcon flipped />
        </button>
        <span aria-hidden className={`${DIVIDER_CLASS} max-lg:hidden`} />
        <span aria-hidden className="basis-full border-t border-hairline lg:hidden" />
        {PANELS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={panel === id}
            onClick={() => togglePanel(id)}
            className={TOOL_BUTTON_CLASS}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Banners and panels keep a readable width, however long the row above runs. */}
      <div className="flex min-h-0 flex-col gap-3 lg:w-[26rem] max-md:gap-2">
        {tool === 'route' && <RouteBanner catalogue={catalogue} />}
        {tool === 'ruler' && <RulerBanner catalogue={catalogue} />}
        {tool === 'autoroute' && (
          <AutoRouteBanner catalogue={catalogue} visibleSystems={visibleSystems} />
        )}
        {panel && (
          <aside
            aria-label={PANELS.find(([id]) => id === panel)?.[2]}
            className={`${SURFACE_CLASS} min-h-0 overflow-y-auto max-md:max-h-[50dvh]`}
          >
            {panel === 'routes' && <RoutePanel catalogue={catalogue} />}
            {panel === 'world' && <WorldPanel catalogue={catalogue} />}
            {panel === 'drive' && <TravelCalculator />}
            {panel === 'network' && (
              <NetworkPanel catalogue={catalogue} visibleSystems={visibleSystems} />
            )}
            {panel === 'probes' && <ProbesPanel catalogue={catalogue} />}
            {panel === 'about' && <AboutPanel meta={catalogue.meta} />}
          </aside>
        )}
      </div>
    </div>
  );
}
