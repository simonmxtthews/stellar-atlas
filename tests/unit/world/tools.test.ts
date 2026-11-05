import { beforeEach, describe, expect, it } from 'vitest';
import { useUi } from '../../../src/store/ui';

const ui = () => useUi.getState();
const initial = useUi.getState();

beforeEach(() => useUi.setState(initial, true));

describe('route mode', () => {
  it('collects waypoints, ignoring a repeat click on the same system', () => {
    ui().startRoute();
    ui().addWaypoint('a');
    ui().addWaypoint('a');
    ui().addWaypoint('b');
    ui().addWaypoint('a');
    expect(ui().routeDraft).toEqual(['a', 'b', 'a']);
    ui().removeLastWaypoint();
    expect(ui().routeDraft).toEqual(['a', 'b']);
  });

  it('starts from a system and closes the modal', () => {
    ui().select('sys', 'star');
    ui().startRoute('sys');
    expect(ui().routeDraft).toEqual(['sys']);
    expect(ui().detail).toBeNull();
    expect(ui().selectedSystemIds).toEqual(['sys']);
  });

  it('forgets the draft when it ends', () => {
    ui().startRoute('a');
    ui().endTool();
    expect(ui().tool).toBe('none');
    expect(ui().routeDraft).toEqual([]);
  });
});

describe('ruler', () => {
  it('measures two stars, and a third starts over', () => {
    ui().startRuler();
    ui().pickRulerStar('a');
    ui().pickRulerStar('a');
    expect(ui().rulerStarIds).toEqual(['a']);
    ui().pickRulerStar('b');
    expect(ui().rulerStarIds).toEqual(['a', 'b']);
    ui().pickRulerStar('c');
    expect(ui().rulerStarIds).toEqual(['c']);
  });

  it('switching tools drops the other tool’s state', () => {
    ui().startRoute('a');
    ui().startRuler();
    expect(ui().routeDraft).toEqual([]);
    ui().pickRulerStar('x');
    ui().startRoute();
    expect(ui().rulerStarIds).toEqual([]);
  });
});

describe('route display', () => {
  it('toggles a route’s visibility', () => {
    ui().toggleRouteHidden('r');
    expect(ui().hiddenRouteIds).toEqual(['r']);
    ui().toggleRouteHidden('r');
    expect(ui().hiddenRouteIds).toEqual([]);
  });

  it('opens the panel on a route it is asked to show', () => {
    ui().showRoute('r');
    expect(ui()).toMatchObject({ panel: 'routes', expandedRouteId: 'r' });
  });
});
