import type { Position } from '../../src/types/catalogue';
import { distance } from './coords';

export const MERGE_RADIUS_LY = 0.25;

export interface GroupableStar {
  readonly id: string;
  readonly pos: Position;
  readonly absMag?: number;
  readonly compPrimaryId?: string;
  readonly baseName?: string; // HYG's shared multiple-star designation
}

export interface StarGroup {
  readonly primaryId: string;
  readonly starIds: readonly string[]; // primary first, then by brightness
}

/**
 * Groups stars by HYG's explicit links, then merges anything closer than MERGE_RADIUS_LY. That
 * radius is what links Proxima to Alpha Centauri, which HYG lists as separate systems.
 */
export function groupSystems(stars: readonly GroupableStar[]): readonly StarGroup[] {
  const parent = new Map(stars.map((star) => [star.id, star.id]));

  const find = (id: string): string => {
    let root = id;
    for (
      let next = parent.get(root);
      next !== undefined && next !== root;
      next = parent.get(root)
    ) {
      root = next;
    }
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  const firstWithBase = new Map<string, string>();
  for (const star of stars) {
    if (star.compPrimaryId && parent.has(star.compPrimaryId)) union(star.id, star.compPrimaryId);
    if (star.baseName) {
      const first = firstWithBase.get(star.baseName);
      if (first === undefined) firstWithBase.set(star.baseName, star.id);
      else union(star.id, first);
    }
  }

  stars.forEach((a, i) => {
    for (const b of stars.slice(i + 1)) {
      if (distance(a.pos, b.pos) < MERGE_RADIUS_LY) union(a.id, b.id);
    }
  });

  const members = new Map<string, GroupableStar[]>();
  for (const star of stars) {
    const root = find(star.id);
    members.set(root, [...(members.get(root) ?? []), star]);
  }

  return [...members.values()].map((group) => {
    const sorted = [...group].sort(
      (a, b) => (a.absMag ?? Infinity) - (b.absMag ?? Infinity) || a.id.localeCompare(b.id),
    );
    const starIds = sorted.map((star) => star.id);
    return { primaryId: starIds[0] ?? '', starIds };
  });
}
