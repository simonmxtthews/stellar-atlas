import type { SpectralClass, Star } from '../types/catalogue';
import { distanceFromReference } from './filters';

export type StarSortKey = 'name' | 'type' | 'distance' | 'mag' | 'planets';
export type SortDirection = 'asc' | 'desc';

export interface StarSort {
  readonly key: StarSortKey;
  readonly direction: SortDirection;
}

export const DEFAULT_STAR_SORT: StarSort = { key: 'distance', direction: 'asc' };

// Which way a column sorts on its first click: what you'd most likely want to see at the top.
export const FIRST_DIRECTION: Readonly<Record<StarSortKey, SortDirection>> = {
  name: 'asc', // A to Z
  type: 'asc', // hottest first
  distance: 'asc', // closest first
  mag: 'asc', // brightest first
  planets: 'desc', // most first
};

export const STAR_PAGE_SIZE = 50;

// Hottest to coolest, then the remnants and the uncatalogued.
const CLASS_ORDER: readonly SpectralClass[] = [
  'O',
  'B',
  'A',
  'F',
  'G',
  'K',
  'M',
  'L',
  'T',
  'Y',
  'D',
  'unknown',
];

function typeRank(star: Star): number | undefined {
  if (star.spectral.cls === 'unknown') return undefined;
  return CLASS_ORDER.indexOf(star.spectral.cls) * 10 + (star.spectral.sub ?? 5);
}

function sortValue(star: Star, key: StarSortKey, reference: Star | undefined) {
  switch (key) {
    case 'name':
      return star.displayName;
    case 'type':
      return typeRank(star);
    case 'distance':
      return distanceFromReference(star, reference);
    case 'mag':
      return star.mag;
    case 'planets':
      return star.planetIds.length;
  }
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// Stars missing the value go last whichever way the column runs; ties fall back to distance, then
// name, so the order never shuffles between updates.
export function sortStars(
  stars: readonly Star[],
  sort: StarSort,
  reference: Star | undefined,
): readonly Star[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const rows = stars.map((star) => ({
    star,
    value: sortValue(star, sort.key, reference),
    distance: distanceFromReference(star, reference),
  }));
  rows.sort((a, b) => {
    if (a.value === undefined || b.value === undefined) {
      if (a.value !== b.value) return a.value === undefined ? 1 : -1;
    } else if (typeof a.value === 'string' && typeof b.value === 'string') {
      const byName = collator.compare(a.value, b.value);
      if (byName !== 0) return sign * byName;
    } else if (a.value !== b.value) {
      return sign * (a.value < b.value ? -1 : 1);
    }
    return a.distance - b.distance || collator.compare(a.star.displayName, b.star.displayName);
  });
  return rows.map(({ star }) => star);
}

// Clicking the sorted column flips it; clicking another starts that one its most useful way round.
export function nextSort(current: StarSort, key: StarSortKey): StarSort {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: FIRST_DIRECTION[key] };
}

export function pageCount(total: number, pageSize = STAR_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
