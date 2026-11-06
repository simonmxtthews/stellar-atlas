import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FILTERS } from '../../src/lib/filters';
import { DEFAULT_DRIVE, DRIVE_DEFAULTS } from '../../src/lib/travel';
import { DEFAULT_OVERLAYS, useUi } from '../../src/store/ui';
import { newWorld, useWorld } from '../../src/store/world';
import { FilterPanel } from '../../src/ui/FilterPanel';
import { ResetButton } from '../../src/ui/ResetButton';
import { TravelCalculator } from '../../src/ui/TravelCalculator';
import { sol } from './map/fixtures';

const initialUi = useUi.getState();
const initialWorld = useWorld.getState();
const button = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  useUi.setState(initialUi, true);
  useWorld.setState({ ...initialWorld, world: newWorld('Test'), past: [], future: [] });
});

afterEach(cleanup);

describe('ResetButton', () => {
  it('says what it resets to, and is disabled at the default', () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <ResetButton name="radius" to="50 ly" isDefault={true} onReset={onReset} />,
    );
    fireEvent.click(button(/Reset radius to 50 ly/));
    expect(onReset).not.toHaveBeenCalled();
    expect(button(/Reset radius/).getAttribute('aria-disabled')).toBe('true');
    expect(button(/Reset radius/).hasAttribute('disabled')).toBe(false);
    rerender(<ResetButton name="radius" to="50 ly" isDefault={false} onReset={onReset} />);
    fireEvent.click(button(/Reset radius/));
    expect(onReset).toHaveBeenCalledOnce();
  });
});

describe('the map controls', () => {
  const visible = { stars: 1, systems: 1 };

  it('reset the filters to their defaults, leaving the others as they are', () => {
    useUi.getState().setFilters({
      radiusLy: 20,
      hiddenClasses: ['M'],
      hasPlanets: true,
      taggedOnly: true,
    });
    render(<FilterPanel stars={[sol]} visible={visible} />);

    fireEvent.click(button(/Reset radius/));
    expect(useUi.getState().filters).toMatchObject({ radiusLy: 50, hiddenClasses: ['M'] });
    fireEvent.click(button(/Reset spectral classes/));
    expect(useUi.getState().filters).toMatchObject({ hiddenClasses: [], hasPlanets: true });
    fireEvent.click(button(/Reset system filters/));
    expect(useUi.getState().filters).toEqual(DEFAULT_FILTERS);
  });

  it('reset only their own overlays', () => {
    useUi.setState({ overlays: { ...DEFAULT_OVERLAYS, grid: false, probes: true } });
    render(<FilterPanel stars={[sol]} visible={visible} />);
    fireEvent.click(button(/Reset overlays/));
    expect(useUi.getState().overlays).toEqual({ ...DEFAULT_OVERLAYS, probes: true });
  });
});

describe('the drive panel', () => {
  const drive = () => useWorld.getState().world.drive;

  it('resets one field, keeping the rest, as a single undo step', () => {
    useWorld.getState().setDrive({ type: 'jump', maxJumpLy: 25, daysPerJump: 14 });
    render(<TravelCalculator />);
    fireEvent.click(button(/Reset Max jump/));
    expect(drive()).toEqual({ type: 'jump', maxJumpLy: 10, daysPerJump: 14 });
    useWorld.getState().undo();
    expect(drive()).toEqual({ type: 'jump', maxJumpLy: 25, daysPerJump: 14 });
  });

  it('keeps a reset as its own undo step, however soon after typing', () => {
    render(<TravelCalculator />);
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: /Max jump/ });
    fireEvent.change(field, { target: { value: '25' } });
    fireEvent.click(button(/Reset Max jump/));
    expect(field.value).toBe('10');
    useWorld.getState().undo();
    expect(drive()).toMatchObject({ maxJumpLy: 25 });
    useWorld.getState().undo();
    expect(drive()).toMatchObject({ maxJumpLy: 10 });
  });

  it('resets a half-typed field too', () => {
    render(<TravelCalculator />);
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: /Max jump/ });
    fireEvent.change(field, { target: { value: '30' } });
    fireEvent.change(field, { target: { value: '' } });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    fireEvent.click(button(/Reset Max jump/));
    expect(field.value).toBe(String(DRIVE_DEFAULTS.jump.maxJumpLy));
    expect(field.getAttribute('aria-invalid')).toBe('false');
  });

  it('resets the whole drive from any model, and only then disables that reset', () => {
    useWorld.getState().setDrive({ type: 'sublight', fractionC: 0.5, accelG: 2 });
    render(<TravelCalculator />);
    fireEvent.click(button(/Reset the whole drive/));
    expect(drive()).toEqual(DEFAULT_DRIVE);
    expect(button(/Reset the whole drive/).getAttribute('aria-disabled')).toBe('true');
  });

  it('resets the calculator distance, which is no part of the world', () => {
    render(<TravelCalculator />);
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Distance (ly)' });
    fireEvent.change(field, { target: { value: '20' } });
    fireEvent.blur(field);
    fireEvent.click(button(/Reset Distance/));
    expect(field.value).toBe('4.37');
    expect(useWorld.getState().past).toHaveLength(0);
  });
});
