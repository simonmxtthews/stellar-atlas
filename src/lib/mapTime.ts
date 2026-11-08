import type { Position, Star, StarMotion, StarSystem } from '../types/catalogue';
import { galacticToScene } from './coords';
import { MAX_YEARS_AHEAD, STAR_EPOCH_YEAR } from './probes';

// Years to move stars on from their catalogue positions. Today's map is the catalogue as it stands,
// so that every distance on it agrees with the star's own figures.
export function yearsFromCatalogue(yearsAhead: number, thisYear: number): number {
  return yearsAhead === 0 ? 0 : thisYear + yearsAhead - STAR_EPOCH_YEAR;
}

// The years ahead that a typed year asks for, or null unless it's a whole year the timeline can
// show: from this year to MAX_YEARS_AHEAD on. Exact, not rounded to the slider's steps.
export function yearsAheadOf(text: string, thisYear: number): number | null {
  const trimmed = text
    .trim()
    .replace(/^AD\s*/i, '')
    .replaceAll(',', '');
  if (!/^\d+$/.test(trimmed)) return null;
  const yearsAhead = Number(trimmed) - thisYear;
  return yearsAhead >= 0 && yearsAhead <= MAX_YEARS_AHEAD ? yearsAhead : null;
}

export function movedPosition(
  pos: Position,
  motion: StarMotion | undefined,
  years: number,
): Position {
  if (!motion || years === 0) return pos;
  const [vx, vy, vz] = motion.velLyPerYear;
  return [pos[0] + vx * years, pos[1] + vy * years, pos[2] + vz * years];
}

// The scene positions of every star, moved on by the given years. The same array for no years.
export function movedScenePositions(
  positions: Float32Array,
  stars: readonly Star[],
  systemsById: ReadonlyMap<string, StarSystem>,
  years: number,
): Float32Array {
  if (years === 0) return positions;
  const moved = Float32Array.from(positions);
  stars.forEach((star, i) => {
    const motion = systemsById.get(star.systemId)?.motion;
    if (!motion) return;
    const [dx, dy, dz] = galacticToScene(motion.velLyPerYear);
    moved[i * 3] = (positions[i * 3] ?? 0) + dx * years;
    moved[i * 3 + 1] = (positions[i * 3 + 1] ?? 0) + dy * years;
    moved[i * 3 + 2] = (positions[i * 3 + 2] ?? 0) + dz * years;
  });
  return moved;
}
