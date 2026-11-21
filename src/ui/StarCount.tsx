import { useUi } from '../store/ui';

// The live number of stars on screen, beside the interface toggle. It follows the camera as well as
// the filters, and stays up with the rest of the interface put away. Pressed, it opens the list of
// them, bringing the interface back first if it was put away. It's as wide as its number;
// the toolbar and the phone's search box follow its width through CornerControls.
export function StarCount({ shown }: { readonly shown: number }) {
  const inFrame = useUi((state) => state.starsInFrame);
  const hidden = useUi((state) => state.chromeHidden);
  const listOpen = useUi((state) => state.starListOpen);
  const count = inFrame.toLocaleString('en');
  const detail = `${count} of ${shown.toLocaleString('en')} shown ${shown === 1 ? 'star' : 'stars'} in view`;
  return (
    <button
      type="button"
      data-testid="stars-in-frame"
      aria-label={detail}
      title={`${detail}. ${listOpen && !hidden ? 'Hide' : 'Show'} the list`}
      aria-expanded={listOpen && !hidden}
      onClick={() => {
        const state = useUi.getState();
        if (state.chromeHidden) {
          state.setChromeHidden(false);
          state.setStarListOpen(true);
        } else {
          state.setStarListOpen(!state.starListOpen);
        }
      }}
      className={`flex h-[2.375rem] items-center gap-2 rounded-xl border border-line bg-panel px-3 shadow-panel backdrop-blur transition-[color,background-color,border-color,opacity] select-none hover:bg-raised aria-expanded:border-accent/50 aria-expanded:bg-accent/15 max-md:h-[2.625rem] ${
        hidden ? 'opacity-60 hover:opacity-100 focus-visible:opacity-100' : ''
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0 text-accent"
        fill="currentColor"
      >
        <path d="M8 0.75C8.45 4.9 11.1 7.55 15.25 8C11.1 8.45 8.45 11.1 8 15.25C7.55 11.1 4.9 8.45 0.75 8C4.9 7.55 7.55 4.9 8 0.75Z" />
      </svg>
      <span className="text-sm font-medium text-ink tabular-nums">{count}</span>
      <span aria-hidden className="-ml-0.5 text-xs text-muted max-xl:hidden">
        in view
      </span>
    </button>
  );
}
