import { useEffect, useId, useRef, useState } from 'react';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { StarCountSummary } from './StarCountSummary';

const HOVER_DELAY_MS = 500;

// The live number of stars on screen, beside the interface toggle. It follows the camera as well as
// the filters, and stays up with the rest of the interface put away. Pressed, it opens the list of
// them, bringing the interface back first if it was put away. It's as wide as its number;
// the toolbar and the phone's search box follow its width through CornerControls. Resting the mouse
// or the keyboard's focus on it brings up a summary that adds the exoplanets.
export function StarCount({
  catalogue,
  shown,
}: {
  readonly catalogue: Catalogue;
  readonly shown: number;
}) {
  const inFrame = useUi((state) => state.starsInFrame);
  const hidden = useUi((state) => state.chromeHidden);
  const listOpen = useUi((state) => state.starListOpen);
  const count = inFrame.toLocaleString('en');
  const detail = `${count} of ${shown.toLocaleString('en')} shown ${shown === 1 ? 'star' : 'stars'} in view`;
  const summaryId = useId();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // The scene starts collecting the stars in view right away, so they're current by the time the
  // summary opens.
  const startHover = () => {
    useUi.getState().setStarCountHovered(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSummaryOpen(true), HOVER_DELAY_MS);
  };
  const endHover = () => {
    window.clearTimeout(timer.current);
    useUi.getState().setStarCountHovered(false);
    setSummaryOpen(false);
  };
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      useUi.getState().setStarCountHovered(false);
    },
    [],
  );

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="stars-in-frame"
        aria-label={detail}
        aria-describedby={summaryOpen ? summaryId : undefined}
        aria-expanded={listOpen && !hidden}
        // A touch has no hover: it would only flash the summary on the way to a tap.
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch') startHover();
        }}
        onPointerLeave={endHover}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) startHover();
        }}
        onBlur={endHover}
        onClick={() => {
          endHover();
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
      {summaryOpen && <StarCountSummary id={summaryId} catalogue={catalogue} shown={shown} />}
    </div>
  );
}
