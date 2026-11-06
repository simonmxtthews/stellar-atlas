import { INK_COLOR } from '../lib/palette';
import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { galacticToScene } from '../lib/coords';
import { routeLegs } from '../lib/routes';
import { useAutoRoutePath } from '../ui/useAutoRoute';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import type { Position, StarSystem } from '../types/catalogue';
import type { Route } from '../types/world';
import { useMapShift, type MapShift } from './useMapShift';

export const DRAFT_COLOR = INK_COLOR;
export const RULER_COLOR = '#f5d76e';
export const AUTO_ROUTE_COLOR = '#6fd8c4';
const DASH_LY = 1;
const GAP_LY = 0.6;

type Point = [number, number, number];

function scenePoint(position: Position): Point {
  const [x, y, z] = galacticToScene(position);
  return [x, y, z];
}

export function Polyline({
  positions,
  color,
  width,
  dashed,
}: {
  readonly positions: readonly Position[];
  readonly color: string;
  readonly width: number;
  readonly dashed: boolean;
}) {
  const points = useMemo(() => positions.map(scenePoint), [positions]);
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      color={color}
      lineWidth={width}
      dashed={dashed}
      dashSize={DASH_LY}
      gapSize={GAP_LY}
      transparent
      depthWrite={false}
    />
  );
}

function SavedRoute({
  route,
  catalogue,
  shift,
}: {
  readonly route: Route;
  readonly catalogue: Catalogue;
  readonly shift: MapShift;
}) {
  const positions = useMemo(
    () =>
      route.waypoints.flatMap((id) => {
        const system = catalogue.systemsById.get(id);
        return system ? [shift(system.pos, id)] : [];
      }),
    [catalogue, route.waypoints, shift],
  );
  return (
    <Polyline positions={positions} color={route.color} width={route.width} dashed={route.dashed} />
  );
}

// Routes are the author's, so they stay drawn even where a filter hides their stars.
export function Routes({
  catalogue,
  visibleSystems,
}: {
  readonly catalogue: Catalogue;
  readonly visibleSystems: readonly StarSystem[];
}) {
  const routes = useWorld((state) => state.world.routes);
  const hiddenRouteIds = useUi((state) => state.hiddenRouteIds);
  const routeDraft = useUi((state) => state.routeDraft);
  const rulerStarIds = useUi((state) => state.rulerStarIds);
  const autoRoutePath = useAutoRoutePath(catalogue, visibleSystems);
  const shift = useMapShift(catalogue.systemsById);
  const autoRoutePositions = useMemo(
    () =>
      (autoRoutePath ?? []).flatMap((id) => {
        const system = catalogue.systemsById.get(id);
        return system ? [shift(system.pos, id)] : [];
      }),
    [autoRoutePath, catalogue, shift],
  );
  const draftPositions = useMemo(() => {
    const legs = routeLegs(routeDraft, catalogue.systemsById);
    const first = legs[0];
    return first
      ? [shift(first.from, first.fromId), ...legs.map((leg) => shift(leg.to, leg.toId))]
      : [];
  }, [catalogue, routeDraft, shift]);
  const rulerPositions = useMemo(
    () =>
      rulerStarIds.flatMap((id) => {
        const star = catalogue.starsById.get(id);
        return star ? [shift(star.pos, star.systemId)] : [];
      }),
    [catalogue, rulerStarIds, shift],
  );
  return (
    <>
      {routes
        .filter((route) => !hiddenRouteIds.includes(route.id))
        .map((route) => (
          <SavedRoute key={route.id} route={route} catalogue={catalogue} shift={shift} />
        ))}
      <Polyline positions={draftPositions} color={DRAFT_COLOR} width={2} dashed />
      <Polyline positions={rulerPositions} color={RULER_COLOR} width={1.5} dashed={false} />
      <Polyline positions={autoRoutePositions} color={AUTO_ROUTE_COLOR} width={2} dashed />
    </>
  );
}
