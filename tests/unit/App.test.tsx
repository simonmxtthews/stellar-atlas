import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { useCatalogue } from '../../src/store/catalogue';
import { noProbes, sol, starOf, systemOf } from './map/fixtures';

// jsdom has no ResizeObserver, which the R3F canvas uses to measure itself.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows a loading state, then mounts a canvas with the catalogue counts', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const stars = [sol, starOf({ id: 'hyg:1', distLy: 10 }), starOf({ id: 'hyg:2', distLy: 90 })];
    const systems = stars.map((star) => systemOf(star));
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const data = url.endsWith('stars.json')
          ? stars
          : url.endsWith('systems.json')
            ? systems
            : url.endsWith('probes.json')
              ? noProbes
              : [];
        return Promise.resolve(Response.json(data));
      }),
    );

    const { container } = render(<App />);
    expect(screen.getByRole('status').textContent).toContain('Loading');

    expect((await screen.findByTestId('visible-count')).textContent).toBe('2 stars in 2 systems');
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(useCatalogue.getState().error).toBeNull();
  });
});
