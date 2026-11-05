import { useEffect } from 'react';
import { isTypingTarget } from '../lib/keys';
import { distanceLy, routeLegs, routeLengthLy } from '../lib/routes';
import { formatValue } from '../lib/starFacts';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import { BUTTON_CLASS } from './controlStyles';
import { RoutePanel } from './RoutePanel';
import { WorldPanel } from './WorldPanel';

const SURFACE_CLASS =
  'rounded-lg border border-slate-700/60 bg-slate-950/90 p-3 text-sm text-slate-200 backdrop-blur';

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
  const [from, to] = rulerStarIds.map((id) => catalogue.starsById.get(id));
  return (
    <div role="status" aria-label="Ruler" className={SURFACE_CLASS}>
      <p data-testid="ruler-readout" className="text-xs tabular-nums">
        {from && to
          ? `${from.displayName} → ${to.displayName}: ${formatValue(distanceLy(from.pos, to.pos), 2, 'ly')}`
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

export function Toolbar({ catalogue }: { readonly catalogue: Catalogue }) {
  const tool = useUi((state) => state.tool);
  const panel = useUi((state) => state.panel);
  const startRoute = useUi((state) => state.startRoute);
  const startRuler = useUi((state) => state.startRuler);
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
  }, []);

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
          aria-pressed={panel === 'routes'}
          onClick={() => togglePanel('routes')}
          className={`${BUTTON_CLASS} bg-slate-950/85`}
        >
          Routes
        </button>
        <button
          type="button"
          aria-pressed={panel === 'world'}
          onClick={() => togglePanel('world')}
          className={`${BUTTON_CLASS} bg-slate-950/85`}
        >
          World
        </button>
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
      {panel && (
        <aside
          aria-label={panel === 'routes' ? 'Route panel' : 'World panel'}
          className={`${SURFACE_CLASS} max-h-[calc(100dvh-5rem)] overflow-y-auto max-md:max-h-[50dvh]`}
        >
          {panel === 'routes' ? (
            <RoutePanel catalogue={catalogue} />
          ) : (
            <WorldPanel catalogue={catalogue} />
          )}
        </aside>
      )}
    </div>
  );
}
