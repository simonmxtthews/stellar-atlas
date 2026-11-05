import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTERS } from '../../src/lib/filters';
import type { Catalogue } from '../../src/store/catalogue';
import { useUi } from '../../src/store/ui';
import { SearchBar } from '../../src/ui/SearchBar';
import { sol, starOf, systemOf } from './map/fixtures';

const tauCeti = starOf({
  id: 'hyg:1',
  displayName: 'Tau Ceti',
  distLy: 11.9,
  spectral: { raw: 'G8V', cls: 'G' },
  names: { bayer: 'Tau Ceti', hd: 'HD 10700', other: [] },
});
const tauBoo = starOf({
  id: 'hyg:2',
  displayName: 'Tau Boötis',
  distLy: 51.2,
  spectral: { raw: 'F7V', cls: 'F' },
  names: { bayer: 'Tau Boötis', other: [] },
});
const stars = [sol, tauCeti, tauBoo];
const systems = stars.map((star) => systemOf(star));
const catalogue: Catalogue = {
  stars,
  systems,
  starsById: new Map(stars.map((star) => [star.id, star])),
  starIndexById: new Map(stars.map((star, i) => [star.id, i])),
  systemsById: new Map(systems.map((system) => [system.id, system])),
  planetsById: new Map(),
};

const initialUi = useUi.getState();

async function renderBar(): Promise<HTMLInputElement> {
  render(<SearchBar catalogue={catalogue} />);
  // The index builds when idle.
  await act(() => new Promise((done) => setTimeout(done, 5)));
  return screen.getByRole<HTMLInputElement>('combobox');
}

function type(input: HTMLInputElement, text: string): void {
  act(() => input.focus());
  fireEvent.change(input, { target: { value: text } });
}

beforeEach(() => {
  useUi.setState(initialUi, true);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe('SearchBar', () => {
  it('/ focuses the input without typing the slash', async () => {
    const input = await renderBar();
    const notPrevented = fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(input);
    expect(notPrevented).toBe(false);
  });

  it('leaves browser shortcuts on / alone', async () => {
    const input = await renderBar();
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(document.activeElement).not.toBe(input);
  });

  it('lists name, class and distance', async () => {
    const input = await renderBar();
    type(input, 'tau cet');
    const option = screen.getByRole('option');
    expect(option.textContent).toContain('Tau Ceti');
    expect(option.textContent).toContain('G8V');
    expect(option.textContent).toContain('11.90 ly');
  });

  it('says so when nothing matches', async () => {
    const input = await renderBar();
    type(input, 'zzzzqq');
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('Enter selects, flies to and opens the top result, then gives the keyboard back', async () => {
    const input = await renderBar();
    type(input, 'hd 10700');
    fireEvent.keyDown(input, { key: 'Enter' });
    const ui = useUi.getState();
    expect(ui.selectedSystemIds).toEqual([tauCeti.systemId]);
    expect(ui.detail).toEqual({ systemId: tauCeti.systemId, starId: tauCeti.id });
    expect(ui.flyRequest).toEqual({ kind: 'star', starId: tauCeti.id });
    expect(input.value).toBe('');
    expect(document.activeElement).not.toBe(input);
  });

  it('arrow keys move the highlight and wrap', async () => {
    const input = await renderBar();
    type(input, 'tau');
    const selected = () =>
      screen.getAllByRole('option').findIndex((option) => option.ariaSelected === 'true');
    expect(selected()).toBe(0);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(selected()).toBe(1);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(selected()).toBe(1);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useUi.getState().detail?.starId).toBe(tauBoo.id);
  });

  it('clicking a result selects it', async () => {
    const input = await renderBar();
    type(input, 'tau cet');
    fireEvent.click(screen.getByRole('option'));
    expect(useUi.getState().detail?.starId).toBe(tauCeti.id);
  });

  it('widens filters that would hide the chosen star', async () => {
    useUi.setState({ filters: { ...DEFAULT_FILTERS, radiusLy: 20, hiddenClasses: ['F', 'K'] } });
    const input = await renderBar();
    type(input, 'tau boo');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useUi.getState().filters).toMatchObject({ radiusLy: 52, hiddenClasses: ['K'] });
  });

  it('keeps typed keys and Esc away from the map shortcuts', async () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    const input = await renderBar();
    type(input, 'h');
    fireEvent.keyDown(input, { key: 'h' });
    fireEvent.keyDown(input, { key: 'Escape' });
    window.removeEventListener('keydown', onWindowKey);
    expect(onWindowKey).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(document.activeElement).not.toBe(input);
  });

  it('Enter with no match does nothing', async () => {
    const input = await renderBar();
    type(input, 'zzzzqq');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useUi.getState().detail).toBeNull();
  });
});
