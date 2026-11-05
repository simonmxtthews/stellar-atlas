import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { routesCsv } from '../../../src/lib/csv';
import { exportFileName, worldFileName } from '../../../src/lib/io';
import { regionColors } from '../../../src/lib/worldView';
import { newWorld } from '../../../src/store/world';
import type { Route, World } from '../../../src/types/world';
import { AboutPanel } from '../../../src/ui/AboutPanel';
import { sol, starOf, systemOf, testMeta } from '../map/fixtures';

const alpha = starOf({ id: 'a', displayName: 'Alpha', pos: [3, 4, 0], distLy: 5 });
const beta = starOf({ id: 'b', displayName: 'Beta', pos: [3, 4, 12], distLy: 13 });
const systems = [sol, alpha, beta].map((star) => systemOf(star));
const systemsById = new Map(systems.map((system) => [system.id, system]));
const [solId, alphaId, betaId] = systems.map((system) => system.id) as [string, string, string];

function routeOf(overrides: Partial<Route>): Route {
  return {
    id: 'r',
    waypoints: [solId, alphaId, betaId],
    kind: 'trade',
    color: '#ffffff',
    dashed: false,
    width: 2,
    ...overrides,
  };
}

function worldOf(routes: readonly Route[], overrides: Partial<World> = {}): World {
  return { ...newWorld('Test'), routes, ...overrides };
}

const csv = (world: World) => routesCsv(world, systems, systemsById).split('\r\n');

afterEach(cleanup);

describe('routesCsv', () => {
  it('has a row per leg with distance and travel time under the drive model', () => {
    const lines = csv(worldOf([routeOf({ name: 'Spine' })]));
    expect(lines).toEqual([
      'route,leg,from,to,ly,travel time',
      'Spine,1,Sol,Alpha,5.00,1 jump · 7.0 d',
      'Spine,2,Alpha,Beta,12.00,no jump path',
      '',
    ]);
  });

  it('follows the drive model', () => {
    const drive = { type: 'ftl-speed', multipleOfC: 365.25 } as const;
    const lines = csv(worldOf([routeOf({ name: 'Spine' })], { drive }));
    expect(lines[1]).toBe('Spine,1,Sol,Alpha,5.00,5.0 d');
  });

  it('titles an unnamed route by its ends and uses custom names', () => {
    const starMeta = { a: { tagIds: [], customName: 'Haven' } };
    const lines = csv(worldOf([routeOf({ waypoints: [solId, alphaId] })], { starMeta }));
    expect(lines[1]).toContain('Sol → Haven (Alpha),1,Sol,Haven (Alpha),5.00');
  });

  it('quotes commas, quotes and newlines', () => {
    const lines = routesCsv(
      worldOf([routeOf({ name: 'The "long", way\nhome', waypoints: [solId, alphaId] })]),
      systems,
      systemsById,
    );
    expect(lines).toContain('"The ""long"", way\nhome",1,');
  });

  it('defuses cells a spreadsheet would run as formulas', () => {
    const lines = csv(worldOf([routeOf({ name: '=HYPERLINK("x")', waypoints: [solId, alphaId] })]));
    expect(lines[1]?.startsWith(`"'=HYPERLINK(""x"")",1,`)).toBe(true);
  });

  it('steps over a waypoint the catalogue lacks, and is only a header with no routes', () => {
    const lines = csv(worldOf([routeOf({ name: 'S', waypoints: [solId, 'gone', alphaId] })]));
    expect(lines[1]).toContain('S,1,Sol,Alpha,5.00');
    expect(csv(worldOf([]))).toEqual(['route,leg,from,to,ly,travel time', '']);
  });
});

describe('file names', () => {
  const date = new Date('2026-11-05T12:00:00Z');

  it('name each export after the world and the date', () => {
    const world = newWorld('The Long Dark!');
    expect(exportFileName(world, date)).toBe('world-the-long-dark-2026-11-05.json');
    expect(worldFileName('routes', 'csv', world, date)).toBe('routes-the-long-dark-2026-11-05.csv');
    expect(worldFileName('snapshot', 'png', world, date)).toBe(
      'snapshot-the-long-dark-2026-11-05.png',
    );
  });
});

describe('regionColors', () => {
  it('colours a system by the first region holding it', () => {
    const colors = regionColors([
      { id: '1', name: 'A', color: '#111111', systemIds: ['x', 'y'] },
      { id: '2', name: 'B', color: '#222222', systemIds: ['y', 'z'] },
    ]);
    expect([...colors]).toEqual([
      ['x', '#111111'],
      ['y', '#111111'],
      ['z', '#222222'],
    ]);
  });
});

describe('AboutPanel', () => {
  it('shows the attribution, build date and counts', () => {
    render(<AboutPanel meta={testMeta} />);
    expect(screen.getByTestId('attribution').textContent).toContain('HYG Database');
    expect(screen.getByTestId('build-date').textContent).toBe('2026-11-05');
    expect(screen.getByText(/4,132 stars in 3,701 systems/)).toBeTruthy();
  });

  it('links a known source to its home page and any other to its own URL', () => {
    render(<AboutPanel meta={testMeta} />);
    const links = within(screen.getByRole('list')).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://astronexus.com/hyg',
      'https://example.test/other',
    ]);
  });
});
