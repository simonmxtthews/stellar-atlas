// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { groupSystems } from '../../../scripts/lib/systems';

const at = (x: number) => [x, 0, 0] as const;

const sets = (groups: ReturnType<typeof groupSystems>) =>
  groups.map((group) => [...group.starIds].sort()).sort();

describe('groupSystems', () => {
  it('leaves distant single stars alone', () => {
    const groups = groupSystems([
      { id: 'a', pos: at(0) },
      { id: 'b', pos: at(5) },
    ]);
    expect(sets(groups)).toEqual([['a'], ['b']]);
  });

  it('follows comp_primary links, however far apart the stars are', () => {
    const groups = groupSystems([
      { id: 'a', pos: at(0) },
      { id: 'b', pos: at(5), compPrimaryId: 'a' },
    ]);
    expect(sets(groups)).toEqual([['a', 'b']]);
  });

  it('ignores a comp_primary outside the catalogue', () => {
    const groups = groupSystems([{ id: 'b', pos: at(5), compPrimaryId: 'gone' }]);
    expect(sets(groups)).toEqual([['b']]);
  });

  it('follows shared base names', () => {
    const groups = groupSystems([
      { id: 'a', pos: at(0), baseName: 'Gl 1' },
      { id: 'b', pos: at(5), baseName: 'Gl 1' },
      { id: 'c', pos: at(9), baseName: 'Gl 2' },
    ]);
    expect(sets(groups)).toEqual([['a', 'b'], ['c']]);
  });

  it('merges unlinked stars closer than 0.25 ly', () => {
    const groups = groupSystems([
      { id: 'a', pos: at(0) },
      { id: 'b', pos: at(0.24) },
      { id: 'c', pos: at(0.4) },
    ]);
    expect(sets(groups)).toEqual([['a', 'b', 'c']]);
    expect(
      sets(
        groupSystems([
          { id: 'a', pos: at(0) },
          { id: 'b', pos: at(0.26) },
        ]),
      ),
    ).toEqual([['a'], ['b']]);
  });

  it('puts the brightest star first, with unknown magnitudes last', () => {
    const [group] = groupSystems([
      { id: 'dim', pos: at(0), absMag: 12 },
      { id: 'unknown', pos: at(0) },
      { id: 'bright', pos: at(0), absMag: 2 },
    ]);
    expect(group?.primaryId).toBe('bright');
    expect(group?.starIds).toEqual(['bright', 'dim', 'unknown']);
  });
});
