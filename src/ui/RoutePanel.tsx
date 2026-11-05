import { movedWaypoints, routeLegs, routeLengthLy, withoutWaypoint } from '../lib/routes';
import { formatValue } from '../lib/starFacts';
import { formatTravelTime, legTravelTime, routeTravelTime } from '../lib/travel';
import { systemCustomName, withCustomName } from '../lib/worldView';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import { ROUTE_KINDS, type Route, type RouteKind } from '../types/world';
import { BUTTON_CLASS, FIELD_LABEL_CLASS, INPUT_CLASS } from './controlStyles';

const MIN_WIDTH = 1;
const MAX_WIDTH = 6;

function useSystemName(catalogue: Catalogue): (id: string) => string {
  const starMeta = useWorld((state) => state.world.starMeta);
  return (id) => {
    const system = catalogue.systemsById.get(id);
    if (!system) return `${id} (not in the catalogue)`;
    return withCustomName(system.name, systemCustomName(starMeta, system));
  };
}

function Waypoints({ route, catalogue }: { readonly route: Route; readonly catalogue: Catalogue }) {
  const moveWaypoint = useWorld((state) => state.moveWaypoint);
  const removeWaypoint = useWorld((state) => state.removeWaypoint);
  const nameOf = useSystemName(catalogue);
  const drive = useWorld((state) => state.world.drive);
  return (
    <ol aria-label="Waypoints" className="mt-2">
      {route.waypoints.map((id, i) => {
        const name = nameOf(id);
        const previous = route.waypoints[i - 1];
        const leg = previous === undefined ? [] : routeLegs([previous, id], catalogue.systemsById);
        return (
          // A route can pass through one system twice.
          <li key={`${id}:${i}`} className="border-t border-slate-800/70 py-1 text-xs">
            {leg[0] && (
              <p data-testid="leg-distance" className="text-slate-400 tabular-nums">
                ↓ {formatValue(leg[0].distanceLy, 2, 'ly')} ·{' '}
                {formatTravelTime(legTravelTime(drive, catalogue.systems, leg[0]))}
              </p>
            )}
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <button
                type="button"
                aria-label={`Move ${name} up`}
                disabled={!movedWaypoints(route.waypoints, i, -1)}
                onClick={() => moveWaypoint(route.id, i, -1)}
                className={BUTTON_CLASS}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${name} down`}
                disabled={!movedWaypoints(route.waypoints, i, 1)}
                onClick={() => moveWaypoint(route.id, i, 1)}
                className={BUTTON_CLASS}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                disabled={!withoutWaypoint(route.waypoints, i)}
                onClick={() => removeWaypoint(route.id, i)}
                className={BUTTON_CLASS}
              >
                ✕
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RouteEditor({
  route,
  catalogue,
}: {
  readonly route: Route;
  readonly catalogue: Catalogue;
}) {
  const updateRoute = useWorld((state) => state.updateRoute);
  const deleteRoute = useWorld((state) => state.deleteRoute);
  return (
    <div className="mt-2">
      <label className="block">
        <span className={FIELD_LABEL_CLASS}>Name</span>
        <input
          type="text"
          value={route.name ?? ''}
          onChange={(event) =>
            updateRoute(route.id, { name: event.target.value || undefined }, 'name')
          }
          className={INPUT_CLASS}
        />
      </label>
      <div className="mt-2 flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className={FIELD_LABEL_CLASS}>Kind</span>
          <select
            value={route.kind}
            onChange={(event) => updateRoute(route.id, { kind: event.target.value as RouteKind })}
            className={`${INPUT_CLASS} capitalize`}
          >
            {ROUTE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>Colour</span>
          <input
            type="color"
            value={route.color}
            onChange={(event) => updateRoute(route.id, { color: event.target.value }, 'color')}
            className="block h-7 w-10 rounded border border-slate-700 bg-slate-900"
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={route.dashed}
            onChange={() => updateRoute(route.id, { dashed: !route.dashed })}
            className="accent-sky-400"
          />
          Dashed
        </label>
        <label className="flex flex-1 items-center gap-2 text-xs">
          Width
          <input
            type="range"
            min={MIN_WIDTH}
            max={MAX_WIDTH}
            step={0.5}
            value={route.width}
            onChange={(event) =>
              updateRoute(route.id, { width: Number(event.target.value) }, 'width')
            }
            className="min-w-0 flex-1 accent-sky-400"
          />
        </label>
      </div>
      <label className="mt-2 block">
        <span className={FIELD_LABEL_CLASS}>Notes</span>
        <textarea
          rows={2}
          value={route.notes ?? ''}
          onChange={(event) =>
            updateRoute(route.id, { notes: event.target.value || undefined }, 'notes')
          }
          className={INPUT_CLASS}
        />
      </label>
      <Waypoints route={route} catalogue={catalogue} />
      <button
        type="button"
        onClick={() => deleteRoute(route.id)}
        className={`${BUTTON_CLASS} mt-2`}
      >
        Delete route
      </button>
    </div>
  );
}

function routeTitle(route: Route, nameOf: (id: string) => string): string {
  if (route.name) return route.name;
  return `${nameOf(route.waypoints[0] ?? '')} → ${nameOf(route.waypoints.at(-1) ?? '')}`;
}

export function RoutePanel({ catalogue }: { readonly catalogue: Catalogue }) {
  const routes = useWorld((state) => state.world.routes);
  const drive = useWorld((state) => state.world.drive);
  const hiddenRouteIds = useUi((state) => state.hiddenRouteIds);
  const expandedRouteId = useUi((state) => state.expandedRouteId);
  const showRoute = useUi((state) => state.showRoute);
  const toggleRouteHidden = useUi((state) => state.toggleRouteHidden);
  const nameOf = useSystemName(catalogue);

  if (routes.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No routes yet. Press <kbd>R</kbd>, then click systems in order.
      </p>
    );
  }
  return (
    <ul aria-label="Routes">
      {routes.map((route) => {
        const title = routeTitle(route, nameOf);
        const expanded = route.id === expandedRouteId;
        const legs = routeLegs(route.waypoints, catalogue.systemsById);
        const total = routeLengthLy(legs);
        return (
          <li key={route.id} className="border-b border-slate-800/70 py-1.5 last:border-b-0">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label={`Show ${title}`}
                checked={!hiddenRouteIds.includes(route.id)}
                onChange={() => toggleRouteHidden(route.id)}
                className="accent-sky-400"
              />
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => showRoute(expanded ? null : route.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-1 text-left hover:bg-slate-800"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-0.5 w-3 shrink-0"
                    style={{ background: route.color }}
                  />
                  <span className="truncate">{title}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-400 tabular-nums">
                  <span data-testid="route-total" className="block">
                    {formatValue(total, 2, 'ly')}
                  </span>
                  <span data-testid="route-time" className="block">
                    {formatTravelTime(routeTravelTime(drive, catalogue.systems, legs))}
                  </span>
                </span>
              </button>
            </div>
            {expanded && <RouteEditor route={route} catalogue={catalogue} />}
          </li>
        );
      })}
    </ul>
  );
}
