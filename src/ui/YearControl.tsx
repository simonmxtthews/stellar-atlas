import { MAX_YEARS_AHEAD } from '../lib/probes';
import { useUi } from '../store/ui';
import { ResetButton } from './ResetButton';
import { PANEL_CLASS } from './controlStyles';
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
    <div className="flex items-end gap-2 text-xs">
      <label className="min-w-0 flex-1">
        <span className="flex justify-between text-muted">
          Year{' '}
          <span data-testid={testId} className="tabular-nums">
            {new Date().getFullYear() + yearsAhead}
          </span>
        </span>
        <YearSlider name={sliderName} className="w-full" />
      </label>
      <YearReset sliderName={sliderName} />
    </div>
  );
}

// Time runs along the foot of the map, centred in the space the left-hand controls and any open
// star details leave. It grows upwards, so a slider being dragged never moves under the pointer.
export function TimelineBar() {
  const yearsAhead = useUi((state) => state.yearsAhead);
  const detailOpen = useUi((state) => state.detail !== null);
  const future = yearsAhead > 0;
  const year = new Date().getFullYear() + yearsAhead;
  return (
    <div
      role="group"
      aria-label="Timeline"
      className={`${PANEL_CLASS} px-3 py-1.5 md:absolute md:right-3 md:bottom-3 md:left-[16.5rem] md:mx-auto md:max-w-2xl max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 ${
        detailOpen ? 'lg:right-[27.5rem]' : ''
      }`}
    >
      {future && (
        <p role="status" aria-label="Future view" className="pb-1 text-xs text-muted">
          <span data-testid="map-year" className="font-medium text-warn">
            Showing AD {year.toLocaleString('en')}
          </span>{' '}
          · Stars have moved. Distances, travel times and filters stay as of today.
        </p>
      )}
      <div className="flex items-center gap-4">
        <div className="w-14 shrink-0">
          <div
            data-testid="global-year"
            className={`text-base leading-5 font-medium tabular-nums ${future ? 'text-warn' : ''}`}
          >
            {year}
          </div>
          <div className="section-label">Year</div>
        </div>
        <div className="min-w-0 flex-1">
          <YearSlider name="Map year" className="block w-full" />
          <div aria-hidden className="flex justify-between px-1.5 text-[0.625rem] text-faint">
            {TICKS.map((tick) => (
              <span key={tick} className="flex w-0 justify-center whitespace-nowrap">
                {tick}
              </span>
            ))}
          </div>
        </div>
        <YearReset sliderName="Map year" />
      </div>
    </div>
  );
}
