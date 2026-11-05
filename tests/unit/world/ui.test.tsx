import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isTypingTarget } from '../../../src/lib/keys';
import { createStarSearch, searchStars, withWorldNames } from '../../../src/lib/search';
import { serialiseWorld } from '../../../src/lib/io';
import type { Catalogue } from '../../../src/store/catalogue';
import { useUi } from '../../../src/store/ui';
import { newWorld, useWorld } from '../../../src/store/world';
import { StarWorldSection } from '../../../src/ui/StarWorldSection';
import { Toolbar } from '../../../src/ui/Toolbar';
import { noProbes, sol, starOf, systemOf, testMeta } from '../map/fixtures';

const alpha = starOf({ id: 'a', displayName: 'Alpha', pos: [3, 4, 0], distLy: 5 });
const beta = starOf({ id: 'b', displayName: 'Beta', pos: [3, 4, 12], distLy: 13 });
const stars = [sol, alpha, beta];
const systems = stars.map((star) => systemOf(star));
const catalogue: Catalogue = {
  stars,
  systems,
  starsById: new Map(stars.map((star) => [star.id, star])),
  starIndexById: new Map(stars.map((star, i) => [star.id, i])),
  systemsById: new Map(systems.map((system) => [system.id, system])),
  planetsById: new Map(),
  meta: testMeta,
  probeData: noProbes,
};
const [solId, alphaId, betaId] = systems.map((system) => system.id) as [string, string, string];

const initialUi = useUi.getState();
const initialWorld = useWorld.getState();
const world = () => useWorld.getState().world;

function press(key: string, init: KeyboardEventInit = {}, target: Element | Window = window): void {
  fireEvent.keyDown(target, { key, ...init });
}

beforeEach(() => {
  useUi.setState(initialUi, true);
  useWorld.setState({ ...initialWorld, world: newWorld('Test'), past: [], future: [] });
});

afterEach(cleanup);

describe('route mode keys', () => {
  beforeEach(() => {
    render(<Toolbar catalogue={catalogue} visibleSystems={systems} />);
  });

  it('R starts, clicks add, Backspace removes, Enter saves and shows the route', () => {
    press('r');
    expect(useUi.getState().tool).toBe('route');
    useUi.getState().addWaypoint(solId);
    useUi.getState().addWaypoint(alphaId);
    useUi.getState().addWaypoint(solId);
    press('Backspace');
    expect(useUi.getState().routeDraft).toEqual([solId, alphaId]);
    useUi.getState().addWaypoint(betaId);
    press('Enter');

    expect(world().routes[0]?.waypoints).toEqual([solId, alphaId, betaId]);
    expect(useUi.getState()).toMatchObject({ tool: 'none', routeDraft: [], panel: 'routes' });
  });

  it('Enter with one waypoint stays in route mode and saves nothing', () => {
    press('r');
    useUi.getState().addWaypoint(solId);
    press('Enter');
    expect(world().routes).toEqual([]);
    expect(useUi.getState().tool).toBe('route');
  });

  it('Enter and Backspace do nothing outside route mode', () => {
    press('Enter');
    press('Backspace');
    expect(useUi.getState().tool).toBe('none');
  });

  it('M toggles the ruler and shows the distance', () => {
    press('m');
    useUi.getState().pickRulerStar('a');
    useUi.getState().pickRulerStar('b');
    return screen.findByTestId('ruler-readout').then((readout) => {
      expect(readout.textContent).toBe('Alpha → Beta: 12.00 ly · no jump path');
      expect(world().routes).toEqual([]);
      press('m');
      expect(useUi.getState()).toMatchObject({ tool: 'none', rulerStarIds: [] });
    });
  });

  it('Ctrl+R stays the browser’s reload, not route mode', () => {
    press('r', { ctrlKey: true });
    press('r', { metaKey: true });
    expect(useUi.getState().tool).toBe('none');
  });

  it('Ctrl/Cmd+Z undoes, with shift or Y redoing', () => {
    useWorld.getState().addTag('One');
    press('z', { ctrlKey: true });
    expect(world().tags).toEqual([]);
    press('z', { metaKey: true, shiftKey: true });
    expect(world().tags).toHaveLength(1);
    press('z', { metaKey: true });
    press('y', { ctrlKey: true });
    expect(world().tags).toHaveLength(1);
  });

  it('leaves keys in a text field to the field', () => {
    fireEvent.click(screen.getByRole('button', { name: 'World' }));
    const name = screen.getByLabelText('World name');
    press('r', {}, name);
    press('m', {}, name);
    useWorld.getState().addTag('One');
    press('z', { ctrlKey: true }, name);
    expect(useUi.getState().tool).toBe('none');
    expect(world().tags).toHaveLength(1);
  });
});

describe('isTypingTarget', () => {
  const element = (html: string) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild;
  };

  it('counts text fields but not checkboxes, sliders or buttons', () => {
    expect(isTypingTarget(element('<input type="text">'))).toBe(true);
    expect(isTypingTarget(element('<input type="search">'))).toBe(true);
    expect(isTypingTarget(element('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(element('<select></select>'))).toBe(true);
    expect(isTypingTarget(element('<input type="checkbox">'))).toBe(false);
    expect(isTypingTarget(element('<input type="range">'))).toBe(false);
    expect(isTypingTarget(element('<button></button>'))).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});

describe('route panel', () => {
  beforeEach(() => {
    useWorld.getState().addRoute([solId, alphaId, betaId]);
    useUi.getState().togglePanel('routes');
    render(<Toolbar catalogue={catalogue} visibleSystems={systems} />);
    fireEvent.click(screen.getByRole('button', { name: /Sol → Beta/ }));
  });

  const route = () => world().routes[0];

  it('shows per-leg distances and the total', () => {
    expect(screen.getAllByTestId('leg-distance').map((leg) => leg.textContent)).toEqual([
      '↓ 5.00 ly · 1 jump · 7.0 d',
      '↓ 12.00 ly · no jump path',
    ]);
    expect(screen.getByTestId('route-total').textContent).toBe('17.00 ly');
  });

  it('edits every field', () => {
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Spine' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'military' } });
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByLabelText('Dashed'));
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Note' } });
    expect(route()).toMatchObject({
      name: 'Spine',
      kind: 'military',
      color: '#123456',
      dashed: true,
      width: 4,
      notes: 'Note',
    });
  });

  it('reorders and deletes waypoints, disabling what would break the route', () => {
    const list = () => within(screen.getByRole('list', { name: 'Waypoints' }));
    expect(list().getByRole<HTMLButtonElement>('button', { name: 'Move Sol up' }).disabled).toBe(
      true,
    );
    fireEvent.click(list().getByRole('button', { name: 'Move Sol down' }));
    expect(route()?.waypoints).toEqual([alphaId, solId, betaId]);
    fireEvent.click(list().getByRole('button', { name: 'Remove Sol' }));
    expect(route()?.waypoints).toEqual([alphaId, betaId]);
    expect(list().getByRole<HTMLButtonElement>('button', { name: 'Remove Beta' }).disabled).toBe(
      true,
    );
  });

  it('shows, hides and deletes', () => {
    const id = route()?.id ?? '';
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Sol → Beta' }));
    expect(useUi.getState().hiddenRouteIds).toEqual([id]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete route' }));
    expect(world().routes).toEqual([]);
    expect(screen.getByText(/No routes yet/)).toBeTruthy();
  });

  it('names a waypoint the catalogue lacks, so it can still be removed', () => {
    const [saved] = world().routes;
    if (!saved) throw new Error('No route');
    act(() =>
      useWorld.setState({
        world: { ...world(), routes: [{ ...saved, waypoints: [solId, 'sys:gone'] }] },
      }),
    );
    expect(screen.getByText('sys:gone (not in the catalogue)')).toBeTruthy();
  });
});

describe('star world section', () => {
  beforeEach(() => {
    render(<StarWorldSection star={alpha} />);
  });

  it('edits the custom name and notes', () => {
    fireEvent.change(screen.getByLabelText('Custom name'), { target: { value: 'Haven' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'A note' } });
    expect(world().starMeta[alpha.id]).toEqual({
      tagIds: [],
      customName: 'Haven',
      notes: 'A note',
    });
  });

  it('creates a tag on this star, then toggles it', () => {
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: ' Colonised ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const tag = world().tags[0];
    expect(tag?.label).toBe('Colonised');
    expect(world().starMeta[alpha.id]?.tagIds).toEqual([tag?.id]);
    fireEvent.click(screen.getByRole('button', { name: 'Colonised', pressed: true }));
    expect(world().starMeta[alpha.id]).toBeUndefined();
  });

  it('ignores a blank tag', () => {
    fireEvent.change(screen.getByLabelText('New tag'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(world().tags).toEqual([]);
  });

  it('starts a route from this system', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start route here' }));
    expect(useUi.getState()).toMatchObject({ tool: 'route', routeDraft: [alpha.systemId] });
  });
});

describe('world panel', () => {
  beforeEach(() => {
    useUi.getState().togglePanel('world');
    render(<Toolbar catalogue={catalogue} visibleSystems={systems} />);
  });

  const importText = async (text: string) => {
    const file = new File([text], 'world.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('World file'), { target: { files: [file] } });
  };

  it('reports unknown IDs and replaces on request', async () => {
    const incoming = {
      ...newWorld('Incoming'),
      starMeta: { 'hyg:missing': { tagIds: [], notes: 'hello' } },
    };
    await importText(serialiseWorld(incoming));
    expect((await screen.findByTestId('unknown-ids')).textContent).toContain('hyg:missing');
    expect(world().name).toBe('Test');

    fireEvent.click(screen.getByRole('button', { name: 'Replace this world' }));
    expect(world()).toEqual(incoming);
    expect(screen.queryByRole('group', { name: 'Import' })).toBeNull();
  });

  it('merges on request, and cancel changes nothing', async () => {
    useWorld.getState().addTag('Ours');
    const incoming = {
      ...newWorld('Incoming'),
      tags: [{ id: 'tag:new', label: 'Theirs', color: '#123456' }],
    };
    await importText(serialiseWorld(incoming));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(world().tags).toHaveLength(1);

    await importText(serialiseWorld(incoming));
    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));
    expect(world().name).toBe('Test');
    expect(world().tags.map((tag) => tag.label)).toEqual(['Ours', 'Theirs']);
  });

  it('reports a bad file instead of throwing', async () => {
    await importText('not json');
    expect((await screen.findByRole('alert')).textContent).toContain('not valid JSON');
    expect(world().name).toBe('Test');
  });

  it('manages tags: rename, recolour, delete', () => {
    fireEvent.change(screen.getByLabelText('New tag name'), { target: { value: 'Core' } });
    fireEvent.click(within(screen.getByRole('region', { name: 'Tags' })).getByRole('button'));
    fireEvent.change(screen.getByLabelText('Name of Core'), { target: { value: 'Hub' } });
    fireEvent.change(screen.getByLabelText('Colour of Hub'), { target: { value: '#abcdef' } });
    expect(world().tags[0]).toMatchObject({ label: 'Hub', color: '#abcdef' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Hub' }));
    expect(world().tags).toEqual([]);
  });

  it('creates and switches worlds', () => {
    const first = useWorld.getState().worldId;
    fireEvent.click(screen.getByRole('button', { name: 'New world' }));
    expect(world().name).toBe('World 2');
    fireEvent.change(screen.getByLabelText('Switch world'), { target: { value: first } });
    expect(world().name).toBe('Test');
  });
});

describe('search finds the author’s names', () => {
  const search = createStarSearch(catalogue);

  it('by custom name and tag label, ahead of catalogue matches, updating as they change', () => {
    expect(searchStars(search, 'haven')).toEqual([]);
    const tags = [{ id: 't', label: 'Hegemony Core', color: '#ffffff' }];
    const named = withWorldNames(
      search,
      { a: { tagIds: [], customName: 'New Haven' }, b: { tagIds: ['t'] } },
      tags,
    );
    expect(searchStars(named, 'haven').map((star) => star.id)).toEqual(['a']);
    expect(searchStars(named, 'new hav').map((star) => star.id)).toEqual(['a']);
    expect(searchStars(named, 'hegemony').map((star) => star.id)).toEqual(['b']);
    // The catalogue still answers.
    expect(searchStars(named, 'beta').map((star) => star.id)).toEqual(['b']);
  });
});
