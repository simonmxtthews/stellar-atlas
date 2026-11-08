import { useEffect } from 'react';
import { isTypingTarget } from '../lib/keys';
import { useUi } from '../store/ui';

// Puts every panel away, or brings them back, so the map can be explored on its own. It stays in
// the top-right corner either way, as the one way back.
export function ChromeToggle() {
  const hidden = useUi((state) => state.chromeHidden);
  const setHidden = useUi((state) => state.setChromeHidden);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'u' || isTypingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const state = useUi.getState();
      state.setChromeHidden(!state.chromeHidden);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const label = hidden ? 'Show interface (U)' : 'Hide interface (U)';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={hidden}
      onClick={() => setHidden(!hidden)}
      className={`absolute top-3 right-3 z-30 grid size-[2.375rem] place-items-center rounded-xl border border-line bg-panel text-ink-soft shadow-panel backdrop-blur transition-[color,background-color,opacity] hover:bg-raised hover:text-ink max-md:size-[2.625rem] ${
        hidden ? 'opacity-60 hover:opacity-100 focus-visible:opacity-100' : ''
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="size-[1.125rem]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1.75 10S4.75 4.25 10 4.25 18.25 10 18.25 10 15.25 15.75 10 15.75 1.75 10 1.75 10Z" />
        <circle cx="10" cy="10" r="2.5" />
        {hidden && <path d="M3 3l14 14" />}
      </svg>
    </button>
  );
}
