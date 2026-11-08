import { useRef, useState } from 'react';
import { yearsAheadOf } from '../lib/mapTime';
import { MAX_YEARS_AHEAD } from '../lib/probes';
import { useUi } from '../store/ui';
import { FieldHeading, ResetButton } from './ResetButton';
import { Slider } from './Slider';

const YEAR_STEP = 100;
const TICKS = ['Today', '+25k', '+50k', '+75k', '+100k'] as const;
const TIME_SLIDER_CLASS = '[--slider-color:var(--color-warn)]';

function YearReset({ sliderName }: { readonly sliderName: string }) {
  const yearsAhead = useUi((state) => state.yearsAhead);
  const setYearsAhead = useUi((state) => state.setYearsAhead);
  return (
    <ResetButton
      name={sliderName.toLowerCase()}
      to="today"
      isDefault={yearsAhead === 0}
      onReset={() => setYearsAhead(0)}
    />
  );
}

function YearSlider({ name, className }: { readonly name: string; readonly className: string }) {
  const yearsAhead = useUi((state) => state.yearsAhead);
  const setYearsAhead = useUi((state) => state.setYearsAhead);
  return (
    <Slider
      aria-label={name}
      min={0}
      max={MAX_YEARS_AHEAD}
      step={YEAR_STEP}
      value={yearsAhead}
      onChange={(event) => setYearsAhead(Number(event.target.value))}
      className={`${TIME_SLIDER_CLASS} ${className}`}
    />
  );
}

// Every one of these drives the one year that the whole map is drawn in.
export function YearControl({
  sliderName,
  testId,
}: {
  readonly sliderName: string;
  readonly testId: string;
}) {
  const yearsAhead = useUi((state) => state.yearsAhead);
  return (
    <div>
      <FieldHeading
        variant="field"
        label="Year"
        reset={<YearReset sliderName={sliderName} />}
        value={<span data-testid={testId}>{new Date().getFullYear() + yearsAhead}</span>}
      />
      <YearSlider name={sliderName} className="block w-full" />
    </div>
  );
}

// The year, as a field: type one and press Enter (or leave the field) to jump straight to it. Only
// a year the slider could reach is taken; anything else is marked while typing and dropped after.
function YearField({ year, future }: { readonly year: number; readonly future: boolean }) {
  const setYearsAhead = useUi((state) => state.setYearsAhead);
  const [draft, setDraft] = useState<string | null>(null); // null when not being edited
  // Esc leaves the field, and leaving it saves: this tells that save it was cancelled.
  const cancelled = useRef(false);
  const thisYear = new Date().getFullYear();
  const invalid = draft !== null && yearsAheadOf(draft, thisYear) === null;
  const range = `${thisYear} to ${thisYear + MAX_YEARS_AHEAD}`;

  const commit = () => {
    if (cancelled.current || draft === null) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const yearsAhead = yearsAheadOf(draft, thisYear);
    if (yearsAhead !== null) setYearsAhead(yearsAhead);
    setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={`Map year, ${range}`}
      title={`Type a year from ${range}`}
      aria-invalid={invalid}
      data-testid="global-year"
      value={draft ?? String(year)}
      onFocus={(event) => {
        setDraft(String(year));
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      className={`-my-0.5 h-5 w-[7ch] rounded border border-transparent bg-transparent px-1 text-right font-sans text-xs tracking-normal tabular-nums normal-case transition-colors outline-none hover:border-line focus:border-accent focus:bg-field aria-invalid:border-danger aria-invalid:text-danger max-md:h-7 max-md:text-base ${
        future ? 'text-warn' : 'text-ink-soft'
      }`}
    />
  );
}

// The foot of the map controls: a heading with the year, the slider and its scale, with a line
// above them while the map is drawn in the future.
export function TimelineBar() {
  const yearsAhead = useUi((state) => state.yearsAhead);
  const future = yearsAhead > 0;
  const year = new Date().getFullYear() + yearsAhead;
  const note = 'Figures stay as of today.';
  const fullNote = 'Stars have moved. Distances, travel times and filters stay as of today.';
  return (
    <div role="group" aria-label="Timeline" className="px-3 pt-3 pb-2.5">
      {/* Empty, and so no height, today. Both the rail and the phone sheet are pinned at the bottom,
          so a line here pushes upwards and the slider stays under a pointer that is dragging it. */}
      <p
        role="status"
        aria-label="Future view"
        title={future ? fullNote : undefined}
        className={`truncate text-[0.6875rem] leading-4 text-faint ${future ? 'mb-1' : ''}`}
      >
        {future && (
          <>
            <span data-testid="map-year" className="text-warn">
              Stars have moved.
            </span>{' '}
            {note}
          </>
        )}
      </p>
      {/* Laid out like the radius slider above it. */}
      <FieldHeading
        label="Timeline"
        reset={<YearReset sliderName="Map year" />}
        value={<YearField year={year} future={future} />}
      />
      <YearSlider name="Map year" className="block w-full" />
      {/* Each sits under the thumb's centre at its value; the end ones tuck inside the track. */}
      <div aria-hidden className="relative mx-1.5 h-3.5 text-[0.625rem] leading-3.5 text-faint">
        {TICKS.map((tick, i) => (
          <span
            key={tick}
            // The rail is narrow, so it keeps every other one; the phone sheet has room for all.
            className={`absolute whitespace-nowrap ${i % 2 === 1 ? 'md:hidden' : ''} ${
              i === 0
                ? '-ml-1.5'
                : i === TICKS.length - 1
                  ? '-mr-1.5 -translate-x-full'
                  : '-translate-x-1/2'
            }`}
            style={{ left: `${(i / (TICKS.length - 1)) * 100}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}
