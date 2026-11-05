import { useEffect } from 'react';
import { isTypingTarget } from '../lib/keys';
import { distanceLy, routeLegs, routeLengthLy } from '../lib/routes';
import { formatValue } from '../lib/starFacts';
import { formatTravelTime, routeTravelTime, systemTravelTime } from '../lib/travel';
import type { Catalogue } from '../store/catalogue';
import { useUi, type Panel } from '../store/ui';
import { useWorld } from '../store/world';
import { AboutPanel } from './AboutPanel';
import { BUTTON_CLASS } from './controlStyles';
import type { StarSystem } from '../types/catalogue';
import { NetworkPanel } from './NetworkPanel';
import { ProbesPanel } from './ProbesPanel';
import { RoutePanel } from './RoutePanel';
import { TravelCalculator } from './TravelCalculator';
import { autoRoutePath, useAutoRoutePath } from './useAutoRoute';
import { WorldPanel } from './WorldPanel';

const SURFACE_CLASS =
  'rounded-lg border border-slate-700/60 bg-slate-950/90 p-3 text-sm text-slate-200 backdrop-blur';

const PANELS: readonly (readonly [Panel, string, string])[] = [
  ['routes', 'Routes', 'Route panel'],
  ['world', 'World', 'World panel'],
  ['drive', 'Drive', 'Drive panel'],
  ['network', 'Network', 'Network panel'],
  ['probes', 'Probes', 'Probes panel'],
  ['about', 'About', 'About panel'],
];

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
      <p className="mt-1 text-xs text-slate-400 tabular-nums">
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
        <p data-testid="auto-route-total" className="mt-1 text-xs text-slate-400 tabular-nums">
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
  const startRoute = useUi((state) => state.startRoute);
  const startRuler = useUi((state) => state.startRuler);
  const startAutoRoute = useUi((state) => state.startAutoRoute);
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
    <div className="absolute top-2 left-[16.5rem] z-5 flex w-96 flex-col gap-2 max-md:inset-x-3 max-md:top-14 max-md:w-auto">
      <div role="toolbar" aria-label="World tools" className="flex flex-wrap gap-1">
        <button
          type="button"
          aria-pressed={tool === 'route'}
          onClick={() => (tool === 'route' ? endTool() : startRoute())}
          className={`${BUTTON_CLASS} bg-slate-950/85`}
        >
          Route (R)
        </button>
        <button
          type="button"
          aria-pressed={tool === 'ruler'}
          onClick={() => (tool === 'ruler' ? endTool() : startRuler())}
          className={`${BUTTON_CLASS} bg-slate-950/85`}
        >
          Ruler (M)
        </button>
        <button
          type="button"
          aria-pressed={tool === 'autoroute'}
          onClick={() => (tool === 'autoroute' ? endTool() : startAutoRoute())}
          className={`${BUTTON_CLASS} bg-slate-950/85`}
        >
          Auto-route (A)
        </button>
        {PANELS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={panel === id}
            onClick={() => togglePanel(id)}
            className={`${BUTTON_CLASS} bg-slate-950/85`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={!canUndo}
          onClick={undo}
          className={`${BUTTON_CLASS} bg-slate-950/85`}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={redo}
          className={`${BUTTON_CLASS} bg-slate-950/85`}
        >
          Redo
        </button>
      </div>
      {tool === 'route' && <RouteBanner catalogue={catalogue} />}
      {tool === 'ruler' && <RulerBanner catalogue={catalogue} />}
      {tool === 'autoroute' && (
        <AutoRouteBanner catalogue={catalogue} visibleSystems={visibleSystems} />
      )}
      {panel && (
        <aside
          aria-label={PANELS.find(([id]) => id === panel)?.[2]}
          className={`${SURFACE_CLASS} max-h-[calc(100dvh-5rem)] overflow-y-auto max-md:max-h-[50dvh]`}
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
  );
}
