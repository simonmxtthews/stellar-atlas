import { useMemo } from 'react';
import { movedPosition, yearsFromCatalogue } from '../lib/mapTime';
import { useUi } from '../store/ui';
import type { Position, StarSystem } from '../types/catalogue';

export type MapShift = (pos: Position, systemId: string) => Position;

const unshifted: MapShift = (pos) => pos;

export function useMapYears(): number {
  const yearsAhead = useUi((state) => state.yearsAhead);
  return yearsFromCatalogue(yearsAhead, new Date().getFullYear());
}

// Where something tied to a system is drawn in the map's year. Only drawing goes through this:
// distances and travel times stay as they are today.
export function useMapShift(systemsById: ReadonlyMap<string, StarSystem>): MapShift {
  const years = useMapYears();
  return useMemo(
    () =>
      years === 0
        ? unshifted
        : (pos, systemId) => movedPosition(pos, systemsById.get(systemId)?.motion, years),
    [systemsById, years],
  );
}
