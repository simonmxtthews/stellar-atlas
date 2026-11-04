import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

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
  it('mounts a canvas', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const { container } = render(<App />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
