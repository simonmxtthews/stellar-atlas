import { useMemo } from 'react';
import { cachedJumpGraph, shortestPath } from '../lib/graph';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import type { StarSystem } from '../types/catalogue';
import type { DriveModel } from '../types/world';

// Through the visible systems, so that filtering to, say, tagged worlds routes through only those.
// The endpoints count even if a filter has since hidden them.
export function autoRoutePath(
  catalogue: Catalogue,
  visibleSystems: readonly StarSystem[],
  [startId, endId]: readonly string[],
  drive: DriveModel,
): readonly string[] | null {
  if (drive.type !== 'jump' || startId === undefined || endId === undefined) return null;
  const visibleIds = new Set(visibleSystems.map((system) => system.id));
  const hidden = [startId, endId]
    .filter((id) => !visibleIds.has(id))
    .flatMap((id) => catalogue.systemsById.get(id) ?? []);
  const nodes = hidden.length === 0 ? visibleSystems : [...visibleSystems, ...hidden];
  return shortestPath(cachedJumpGraph(nodes, drive.maxJumpLy), startId, endId);
}

export function useAutoRoutePath(
  catalogue: Catalogue,
  visibleSystems: readonly StarSystem[],
): readonly string[] | null {
  const autoRouteIds = useUi((state) => state.autoRouteIds);
  const drive = useWorld((state) => state.world.drive);
  return useMemo(
    () => autoRoutePath(catalogue, visibleSystems, autoRouteIds, drive),
    [autoRouteIds, catalogue, drive, visibleSystems],
  );
}
