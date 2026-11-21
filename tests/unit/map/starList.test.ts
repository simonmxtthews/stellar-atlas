import { describe, expect, it } from 'vitest';
import { DEFAULT_STAR_SORT, nextSort, pageCount, sortStars } from '../../../src/lib/starList';
import { starOf } from './fixtures';

const near = starOf({
  id: 'hyg:1',
  displayName: 'Proxima',
  distLy: 4.2,
  pos: [4.2, 0, 0],
  mag: 11,
  spectral: { cls: 'M', sub: 5 },
  planetIds: ['p1', 'p2'],
});
const mid = starOf({
  id: 'hyg:2',
  displayName: 'Barnard',
  distLy: 6,
  pos: [-6, 0, 0],
  spectral: { cls: 'M', sub: 4 },
});
const far = starOf({
  id: 'hyg:3',
  displayName: 'Altair',
  distLy: 16.7,
  pos: [0, 16.7, 0],
  mag: 0.8,
  spectral: { cls: 'A', sub: 7 },
  planetIds: ['p3'],
});
const unknown = starOf({
  id: 'hyg:4',
  displayName: 'Gliese 10',
  distLy: 10,
  pos: [0, 0, 10],
  spectral: { cls: 'unknown' },
});
const stars = [far, unknown, near, mid];
const names = (list: readonly { displayName: string }[]) => list.map((star) => star.displayName);

describe('sortStars', () => {
  it('defaults to closest first', () => {
    expect(names(sortStars(stars, DEFAULT_STAR_SORT, undefined))).toEqual([
      'Proxima',
      'Barnard',
      'Gliese 10',
      'Altair',
    ]);
  });

  it('measures distance from the reference star', () => {
    const order = sortStars(stars, DEFAULT_STAR_SORT, mid);
    expect(names(order)[0]).toBe('Barnard');
    expect(names(order)[1]).toBe('Proxima');
  });

  it('sorts names naturally, either way', () => {
    expect(names(sortStars(stars, { key: 'name', direction: 'asc' }, undefined))).toEqual([
      'Altair',
      'Barnard',
      'Gliese 10',
      'Proxima',
    ]);
    expect(names(sortStars(stars, { key: 'name', direction: 'desc' }, undefined))[0]).toBe(
      'Proxima',
    );
  });

  it('runs spectral types hot to cool and keeps missing values last both ways', () => {
    expect(names(sortStars(stars, { key: 'type', direction: 'asc' }, undefined))).toEqual([
      'Altair',
      'Barnard',
      'Proxima',
      'Gliese 10',
    ]);
    expect(names(sortStars(stars, { key: 'type', direction: 'desc' }, undefined)).at(-1)).toBe(
      'Gliese 10',
    );
    expect(names(sortStars(stars, { key: 'mag', direction: 'desc' }, undefined)).slice(2)).toEqual([
      'Barnard',
      'Gliese 10',
    ]);
  });

  it('breaks ties by distance', () => {
    expect(names(sortStars(stars, { key: 'planets', direction: 'desc' }, undefined))).toEqual([
      'Proxima',
      'Altair',
      'Barnard',
      'Gliese 10',
    ]);
  });
});

describe('nextSort', () => {
  it('flips the current column and starts others their useful way round', () => {
    expect(nextSort(DEFAULT_STAR_SORT, 'distance')).toEqual({ key: 'distance', direction: 'desc' });
    expect(nextSort(DEFAULT_STAR_SORT, 'planets')).toEqual({ key: 'planets', direction: 'desc' });
    expect(nextSort(DEFAULT_STAR_SORT, 'name')).toEqual({ key: 'name', direction: 'asc' });
  });
});

describe('pageCount', () => {
  it('always has at least one page', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
  });
});
