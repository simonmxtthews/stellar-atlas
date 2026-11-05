import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalogue } from '../../src/store/catalogue';
import { useUi } from '../../src/store/ui';
import type { Planet, Star, StarSystem } from '../../src/types/catalogue';
import { StarModal } from '../../src/ui/StarModal';
import { starOf, systemOf } from './map/fixtures';

const planet: Planet = {
  id: 'pl:b',
  name: 'Prox b',
  letter: 'b',
  hostStarId: 'b',
  massEarth: 1.07,
  semiMajorAu: 0.0485,
  periodDays: 11.19,
  discoveryMethod: 'Radial Velocity',
  discoveryYear: 2016,
  inHabitableZone: true,
};

function catalogueOf(stars: readonly Star[], systems: readonly StarSystem[]): Catalogue {
  return {
    stars,
    systems,
    starsById: new Map(stars.map((star) => [star.id, star])),
    starIndexById: new Map(stars.map((star, i) => [star.id, i])),
    systemsById: new Map(systems.map((system) => [system.id, system])),
    planetsById: new Map([[planet.id, planet]]),
  };
}

const primary = starOf({
  id: 'a',
  systemId: 'sys',
  displayName: 'Primary',
  names: { gliese: 'GJ 1', other: [] },
  spectral: { raw: 'K1V', cls: 'K', sub: 1, lumClass: 'V' },
  tempK: 5200,
  massSolar: 0.8,
  massEstimated: true,
  hzAu: [0.5, 1],
  distLy: 4.2267,
});
const companion = starOf({
  id: 'b',
  systemId: 'sys',
  displayName: 'Companion',
  isPrimary: false,
  planetIds: ['pl:b'],
  hzAu: [0.04, 0.05],
});
const system = systemOf(primary, { name: 'The System', starIds: ['a', 'b'], planetCount: 1 });
const neighbours = Array.from({ length: 10 }, (_, i) =>
  systemOf(starOf({ id: `n${i}`, displayName: `Neighbour ${i}`, pos: [i + 1, 0, 0] })),
);
const catalogue = catalogueOf([primary, companion], [system, ...neighbours]);

beforeEach(() => {
  useUi.getState().clearSelection();
});

afterEach(cleanup);

describe('StarModal', () => {
  it('stays closed with nothing selected', () => {
    render(<StarModal catalogue={catalogue} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows designations, facts with the plain reading, and marks estimated mass', () => {
    useUi.getState().select('sys');
    render(<StarModal catalogue={catalogue} />);
    const dialog = screen.getByRole('dialog', { name: 'Primary' });
    expect(within(dialog).getByText('The System system')).toBeTruthy();
    expect(within(dialog).getByTestId('designations').textContent).toBe('GJ 1');
    expect(within(dialog).getByText('K1V — orange main-sequence dwarf')).toBeTruthy();
    expect(within(dialog).getByText('0.8 M☉ (est.)')).toBeTruthy();
    expect(within(dialog).getByText('4.23 ly')).toBeTruthy();
  });

  it('shows the empty state but still draws the zone for a planetless star', () => {
    useUi.getState().select('sys');
    render(<StarModal catalogue={catalogue} />);
    expect(screen.getByText('No confirmed exoplanets')).toBeTruthy();
    expect(screen.getByTestId('hz-zone')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('has a tab per star, flags which hold planets, and switches to the planets', () => {
    useUi.getState().select('sys');
    render(<StarModal catalogue={catalogue} />);
    const tab = screen.getByRole('tab', { name: 'Companion · 1 planet' });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    fireEvent.mouseDown(tab);
    expect(useUi.getState().detail?.starId).toBe('b');
    const planets = screen.getByRole('region', { name: 'Planets' });
    expect(within(planets).getByRole('rowheader', { name: 'Prox b' })).toBeTruthy();
    expect(within(planets).getByText('In zone')).toBeTruthy();
    expect(within(planets).getByText('Radial Velocity, 2016')).toBeTruthy();
    expect(within(planets).getByTestId('hz-strip').querySelectorAll('circle')).toHaveLength(1);
    expect(within(planets).getByRole('link').getAttribute('href')).toBe(
      'https://exoplanetarchive.ipac.caltech.edu/overview/Prox',
    );
  });

  it('opens on the clicked star', () => {
    useUi.getState().select('sys', 'b');
    render(<StarModal catalogue={catalogue} />);
    expect(screen.getByRole('dialog', { name: 'Companion' })).toBeTruthy();
  });

  it('lists the 8 nearest neighbours in order; clicking one selects it', () => {
    useUi.getState().select('sys');
    render(<StarModal catalogue={catalogue} />);
    const section = screen.getByRole('region', { name: 'Nearest neighbours' });
    const buttons = within(section).getAllByRole('button');
    expect(buttons).toHaveLength(8);
    expect(buttons[0]?.textContent).toBe('Neighbour 01.00 ly');
    expect(buttons[7]?.textContent).toBe('Neighbour 78.00 ly');
    fireEvent.click(buttons[0] as HTMLElement);
    expect(useUi.getState().selectedSystemIds).toEqual(['sys:n0']);
  });

  it('closes with the button, keeping the selection', () => {
    useUi.getState().select('sys');
    render(<StarModal catalogue={catalogue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUi.getState().selectedSystemIds).toEqual(['sys']);
  });
});
