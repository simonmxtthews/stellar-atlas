// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assemble } from '../../../scripts/lib/assemble';
import type { ArchiveHost, StarDraft } from '../../../scripts/lib/drafts';
import { RADIUS_PC, hygRowToDraft, isInCatalogue, rowsToHosts } from '../../../scripts/lib/drafts';
import type { ExoplanetRow, HygRow } from '../../../scripts/lib/schema';

const draft = (id: string, fields: Partial<StarDraft> = {}): StarDraft => ({
  id,
  source: 'hyg',
  names: { other: [] },
  pos: [10, 0, 0],
  distPc: 10 / 3.261564,
  raDeg: 0,
  decDeg: 0,
  measured: {},
  matchKeys: {},
  ...fields,
});

const archiveHost = (hostname: string, distPc: number): ArchiveHost => ({
  hostname,
  raDeg: 200,
  decDeg: 40,
  distPc,
  measured: {},
});

const planetRow = (hostname: string, fields: Partial<ExoplanetRow> = {}): ExoplanetRow => ({
  pl_name: `${hostname} b`,
  pl_letter: 'b',
  hostname,
  hd_name: '',
  hip_name: '',
  ra: '200',
  dec: '40',
  sy_dist: '5',
  discoverymethod: 'Transit',
  disc_year: '2020',
  pl_orbper: '',
  pl_orbsmax: '',
  pl_orbeccen: '',
  pl_rade: '',
  pl_bmasse: '',
  pl_eqt: '',
  pl_insol: '',
  st_spectype: '',
  st_teff: '',
  st_lum: '',
  st_mass: '',
  sy_vmag: '',
  ...fields,
});

const hygRow = (fields: Partial<HygRow>): HygRow => ({
  id: '1',
  hip: '',
  hd: '',
  hr: '',
  gl: '',
  proper: '',
  ra: '1',
  dec: '1',
  dist: '10',
  pmra: '0',
  pmdec: '0',
  mag: '5',
  absmag: '5',
  spect: 'G2V',
  ci: '0.65',
  x: '10',
  y: '0',
  z: '0',
  bayer: '',
  flam: '',
  con: '',
  comp_primary: '1',
  base: '',
  var: '',
  ...fields,
});

const noHosts = { hosts: [], planetRows: [], knownMissingHosts: [] };

describe('HYG rows', () => {
  it('drops unknown distances and anything past 100 ly but keeps the Sun', () => {
    expect(isInCatalogue(hygRow({ id: '0', dist: '0' }))).toBe(true);
    expect(isInCatalogue(hygRow({ dist: '100000' }))).toBe(false);
    expect(isInCatalogue(hygRow({ dist: String(RADIUS_PC) }))).toBe(false);
    expect(isInCatalogue(hygRow({ dist: '30.6' }))).toBe(true);
    expect(isInCatalogue(hygRow({ dist: '0' }))).toBe(false);
  });

  it('pins the Sun to the origin despite HYG listing it slightly off', () => {
    const sol = hygRowToDraft(hygRow({ id: '0', dist: '0', x: '0.000005', proper: 'Sol' }));
    expect(sol.pos).toEqual([0, 0, 0]);
    expect(sol.distPc).toBe(0);
  });

  it('converts right ascension from hours to degrees', () => {
    expect(hygRowToDraft(hygRow({ ra: '6' })).raDeg).toBe(90);
  });

  it('builds the alias list from HYG name fields', () => {
    const { names } = hygRowToDraft(
      hygRow({
        proper: 'Toliman',
        bayer: 'Alp-2',
        con: 'Cen',
        gl: 'Gl 559B',
        hip: '71681',
        hd: '128621',
        hr: '5460',
        var: 'V1',
      }),
    );
    expect(names).toEqual({
      proper: 'Toliman',
      bayer: 'Alpha-2 Centauri',
      gliese: 'GJ 559 B',
      hd: 'HD 128621',
      hip: 'HIP 71681',
      hr: 'HR 5460',
      other: ['Alpha Centauri', 'V1 Cen'],
    });
  });
});

describe('rowsToHosts', () => {
  it('collapses planets to one host and converts log luminosity', () => {
    const hosts = rowsToHosts([
      planetRow('Star', { pl_name: 'Star b', st_lum: '' }),
      planetRow('Star', { pl_name: 'Star c', st_lum: '-2' }),
    ]);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.measured.lumSolar).toBeCloseTo(0.01);
  });

  it('decodes the HTML entity the archive puts in spectral types', () => {
    const [host] = rowsToHosts([planetRow('Star', { st_spectype: 'M4&plusmn;0.5' })]);
    expect(host?.spectralRaw).toBe('M4±0.5');
  });
});

describe('assemble', () => {
  it('fails the build on an unexplained host within 30 ly', () => {
    expect(() =>
      assemble({
        drafts: [],
        hosts: [archiveHost('Nearby', 5)],
        planetRows: [planetRow('Nearby')],
        knownMissingHosts: [],
      }),
    ).toThrow(/Nearby/);
  });

  it('injects a confirmed-missing host and any host past 30 ly', () => {
    const result = assemble({
      drafts: [],
      hosts: [archiveHost('Allowed', 5), archiveHost('Far', 20)],
      planetRows: [planetRow('Allowed'), planetRow('Far')],
      knownMissingHosts: ['Allowed'],
    });
    expect(result.stars.map((star) => star.id).sort()).toEqual(['exo:allowed', 'exo:far']);
    expect(result.unmatchedHosts.map((host) => host.hostname)).toEqual(['Allowed', 'Far']);
    expect(result.stars.every((star) => star.source === 'exoplanet-archive')).toBe(true);
    expect(result.staleKnownMissingHosts).toEqual([]);
  });

  it('flags a knownMissingHosts entry once the host matches', () => {
    const result = assemble({ drafts: [], ...noHosts, knownMissingHosts: ['Old'] });
    expect(result.staleKnownMissingHosts).toEqual(['Old']);
  });

  it('prefers archive stellar parameters but keeps source values already set', () => {
    const star = draft('hyg:1', {
      matchKeys: { hip: '1' },
      absMag: 15,
      spectralRaw: 'M5V',
      measured: { tempK: 1234 },
    });
    const host: ArchiveHost = {
      hostname: 'Host',
      hipName: 'HIP 1',
      raDeg: 0,
      decDeg: 0,
      distPc: 3,
      measured: { tempK: 3000, lumSolar: 0.002, massSolar: 0.15 },
    };
    const [result] = assemble({
      drafts: [star],
      hosts: [host],
      planetRows: [planetRow('Host')],
      knownMissingHosts: [],
    }).stars;
    expect(result).toMatchObject({
      tempK: 1234,
      lumSolar: 0.002,
      massSolar: 0.15,
      massEstimated: false,
      planetIds: ['pl:host-b'],
    });
    expect(result?.names.other).toContain('Host');
  });

  it('flags planets by the habitable zone of their host', () => {
    const star = draft('hyg:1', { matchKeys: { hip: '1' } });
    const host: ArchiveHost = {
      hostname: 'Host',
      hipName: 'HIP 1',
      raDeg: 0,
      decDeg: 0,
      distPc: 3,
      measured: { lumSolar: 1 },
    };
    const { planets } = assemble({
      drafts: [star],
      hosts: [host],
      planetRows: [
        planetRow('Host', { pl_name: 'Host b', pl_orbsmax: '1' }),
        planetRow('Host', { pl_name: 'Host c', pl_orbsmax: '5' }),
        planetRow('Host', { pl_name: 'Host d' }),
      ],
      knownMissingHosts: [],
    });
    expect(planets.map((planet) => planet.inHabitableZone)).toEqual([true, false, undefined]);
  });

  it('estimates mass from luminosity only on the main sequence', () => {
    const { stars } = assemble({
      drafts: [
        draft('hyg:dwarf', { absMag: 5, spectralRaw: 'G2V', colourIndex: 0.65 }),
        draft('hyg:giant', { absMag: 0, spectralRaw: 'K0III', colourIndex: 1, pos: [50, 0, 0] }),
      ],
      ...noHosts,
    });
    const byId = new Map(stars.map((star) => [star.id, star]));
    expect(byId.get('hyg:dwarf')).toMatchObject({ massEstimated: true });
    expect(byId.get('hyg:dwarf')?.massSolar).toBeGreaterThan(0.8);
    expect(byId.get('hyg:giant')?.massSolar).toBeUndefined();
    expect(byId.get('hyg:giant')?.massEstimated).toBe(false);
  });

  it('moves a linked companion to its primary distance along its own direction', () => {
    const primary = draft('hyg:1', { absMag: 1, pos: [30, 0, 0], distPc: 30 / 3.261564 });
    const companion = draft('hyg:2', {
      absMag: 9,
      pos: [0, 20, 0],
      distPc: 20 / 3.261564,
      compPrimaryId: 'hyg:1',
    });
    const { stars, relocatedCompanions } = assemble({ drafts: [primary, companion], ...noHosts });
    const moved = stars.find((star) => star.id === 'hyg:2');
    expect(moved?.pos).toEqual([0, 30, 0]);
    expect(moved?.distLy).toBeCloseTo(30);
    expect(relocatedCompanions).toEqual([
      { id: 'hyg:2', primaryId: 'hyg:1', movedLy: Math.hypot(30, 20) },
    ]);
  });

  it('leaves stars merged by proximity where they are', () => {
    const a = draft('hyg:1', { absMag: 1, pos: [10, 0, 0] });
    const b = draft('hyg:2', { absMag: 9, pos: [10.2, 0, 0] });
    const { stars, relocatedCompanions } = assemble({ drafts: [a, b], ...noHosts });
    expect(stars.find((star) => star.id === 'hyg:2')?.pos[0]).toBe(10.2);
    expect(relocatedCompanions).toEqual([]);
  });

  it('marks the primary and points the whole system at it', () => {
    const { stars, systems } = assemble({
      drafts: [
        draft('hyg:1', { absMag: 9, names: { gliese: 'GJ 1 B', other: [] } }),
        draft('hyg:2', { absMag: 1, names: { gliese: 'GJ 1 A', other: [] } }),
      ],
      ...noHosts,
    });
    expect(systems).toHaveLength(1);
    expect(systems[0]).toMatchObject({
      id: 'sys:hyg:2',
      name: 'GJ 1',
      starIds: ['hyg:2', 'hyg:1'],
    });
    expect(stars.filter((star) => star.isPrimary).map((star) => star.id)).toEqual(['hyg:2']);
    expect(new Set(stars.map((star) => star.systemId))).toEqual(new Set(['sys:hyg:2']));
  });
});
