import { useMemo } from 'react';
import { countExoplanets, MAX_ROCKY_RADIUS_EARTH } from '../lib/exoplanets';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { PANEL_CLASS } from './controlStyles';

function Row({
  label,
  note,
  count,
  nested = false,
}: {
  readonly label: string;
  readonly note?: string;
  readonly count: number;
  readonly nested?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${nested ? 'pl-3 text-xs' : ''}`}>
      <dt className={nested ? 'text-muted' : 'text-ink-soft'}>
        {label}
        {note && <span className="text-faint"> {note}</span>}
      </dt>
      <dd className={`tabular-nums ${nested ? 'text-ink-soft' : 'font-medium'}`}>
        {count.toLocaleString('en')}
      </dd>
    </div>
  );
}

// What's in view, below the star count while it's hovered: the stars, and the exoplanets around
// them. Takes no pointer events, so the pointer is only ever on the count itself.
export function StarCountSummary({
  id,
  catalogue,
  shown,
}: {
  readonly id: string;
  readonly catalogue: Catalogue;
  readonly shown: number;
}) {
  const indices = useUi((state) => state.framedStarIndices);
  const planets = useMemo(
    () =>
      countExoplanets(
        indices.flatMap((index) => catalogue.stars[index] ?? []),
        catalogue.planetsById,
      ),
    [catalogue, indices],
  );
  return (
    <div
      id={id}
      role="tooltip"
      data-testid="star-count-summary"
      className={`${PANEL_CLASS} pointer-events-none absolute top-full right-0 mt-2 w-56 px-3 py-2.5`}
    >
      <p className="mb-1.5 section-label">In view</p>
      <dl className="flex flex-col gap-1">
        <Row label="Stars" note={`of ${shown.toLocaleString('en')} shown`} count={indices.length} />
        <Row label="Exoplanets" count={planets.total} />
        <Row nested label="Rocky" note={`≤ ${MAX_ROCKY_RADIUS_EARTH} R⊕`} count={planets.rocky} />
        <Row nested label="Gas" note={`> ${MAX_ROCKY_RADIUS_EARTH} R⊕`} count={planets.gas} />
        {planets.unknown > 0 && (
          <Row nested label="Unclassified" note="no radius" count={planets.unknown} />
        )}
      </dl>
    </div>
  );
}
