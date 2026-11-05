import type { CatalogueMeta, ProbeData, Star, StarSystem } from '../../../src/types/catalogue';

export const noProbes: ProbeData = { epochYear: 2025, probes: [], pulsars: [] };

export const testMeta: CatalogueMeta = {
  buildDate: '2026-11-05T05:11:06.338Z',
  radiusLy: 100,
  sources: [
    {
      name: 'HYG Database',
      version: 'v4.2',
      url: 'https://example.test/hyg.csv.gz',
      licence: 'CC BY-SA 4.0',
      fetchedAt: '2026-11-04T23:03:46.417Z',
    },
    {
      name: 'Some Other Source',
      version: '1',
      url: 'https://example.test/other',
      licence: 'Public',
      fetchedAt: '2026-11-04T23:08:42.283Z',
    },
  ],
  counts: { stars: 4132, systems: 3701, planets: 541 },
  unmatchedHosts: [],
  attribution: 'Star data from the HYG Database.',
  idMap: {},
};

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
