import type { Star, StarSystem } from '../../../src/types/catalogue';

export function starOf(overrides: Partial<Star> & { readonly id: string }): Star {
  return {
    systemId: `sys:${overrides.id}`,
    names: { other: [] },
    displayName: overrides.id,
    pos: [0, 0, 0],
    distLy: 1,
    spectral: { cls: 'G' },
    massEstimated: false,
    colorHex: '#ffffff',
    isPrimary: true,
    planetIds: [],
    source: 'hyg',
    ...overrides,
  };
}

export function systemOf(star: Star, overrides: Partial<StarSystem> = {}): StarSystem {
  return {
    id: star.systemId,
    name: star.displayName,
    starIds: [star.id],
    pos: star.pos,
    distLy: star.distLy,
    planetCount: 0,
    ...overrides,
  };
}

export const sol = starOf({ id: 'hyg:0', displayName: 'Sol', distLy: 0 });
