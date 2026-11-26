import { useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_FILTERS,
  MAX_RADIUS_LY,
  MIN_RADIUS_LY,
  SOL_ID,
  type PlanetFilter,
} from '../lib/filters';
import { DEFAULT_OVERLAYS, useUi, type Overlays } from '../store/ui';
import type { SpectralClass, Star } from '../types/catalogue';
import { Logo } from './Logo';
import { Wordmark } from './Wordmark';
import { RegionLegend } from './RegionLegend';
import { FieldHeading, ResetButton } from './ResetButton';
import { Slider } from './Slider';
import { TimelineBar } from './YearControl';

// The rail's top sits one gutter below the search box (0.75rem + 2.375rem + 0.75rem).
const RAIL_CLASS =
  'absolute top-[3.875rem] left-3 flex max-h-[calc(100dvh-4.625rem)] w-64 flex-col lg:w-68 overflow-hidden rounded-xl border border-line bg-panel text-sm text-ink shadow-panel backdrop-blur max-md:static max-md:max-h-none max-md:w-auto max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0';

const CLASS_LABELS: readonly (readonly [SpectralClass, string, string])[] = [
  ['O', 'O', '#9bb0ff'],
  ['B', 'B', '#aabfff'],
  ['A', 'A', '#cad7ff'],
  ['F', 'F', '#f8f7ff'],
  ['G', 'G', '#fff4ea'],
  ['K', 'K', '#ffd2a1'],
  ['M', 'M', '#ffb56c'],
  ['L', 'L brown dwarf', '#ff8a5c'],
  ['T', 'T brown dwarf', '#d9607a'],
  ['Y', 'Y brown dwarf', '#8a5a9e'],
  ['D', 'D white dwarf', '#e8eeff'],
  ['unknown', 'Unknown', '#c8c8c8'],
];

const PLANET_LABELS: readonly (readonly [PlanetFilter, string])[] = [
  ['all', 'Show all'],
  ['any', 'Any exoplanets'],
  ['rocky', 'Rocky exoplanets'],
  ['gas', 'Gas exoplanets'],
  ['both', 'Both rocky and gas'],
  ['habitable', 'Potentially habitable'],
  ['none', 'No known exoplanets'],
];

const OVERLAY_LABELS: readonly (readonly [keyof Overlays, string])[] = [
  ['grid', 'Galactic grid'],
  ['rings', 'Range rings (5 ly)'],
  ['dropLines', 'Drop lines'],
];

function Check({
  label,
  checked,
  onChange,
  swatch,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly swatch?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {swatch && (
        <span
          aria-hidden
          className="inline-block size-2.5 rounded-full"
          style={{ background: swatch }}
        />
      )}
      {label}
    </label>
  );
}

function Section({
  title,
  reset,
  children,
}: {
  readonly title: string;
  readonly reset: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <fieldset className="mt-3">
      <legend className="mb-1 w-full">
        <FieldHeading label={title} reset={reset} />
      </legend>
      {children}
    </fieldset>
  );
}

interface FilterPanelProps {
  readonly stars: readonly Star[];
  readonly visible: { readonly stars: number; readonly systems: number };
}

export function FilterPanel({ stars, visible }: FilterPanelProps) {
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const filters = useUi((state) => state.filters);
  const overlays = useUi((state) => state.overlays);
  const orbitStarId = useUi((state) => state.orbitStarId);
  const referenceStarId = useUi((state) => state.referenceStarId);
  const setReference = useUi((state) => state.setReference);
  const selectedCount = useUi((state) => state.selectedSystemIds.length);
  const clearSelection = useUi((state) => state.clearSelection);
  const labelCount = useUi((state) => state.labelCount);
  const setFilters = useUi((state) => state.setFilters);
  const toggleClass = useUi((state) => state.toggleClass);
  const toggleOverlay = useUi((state) => state.toggleOverlay);
  const resetOverlays = useUi((state) => state.resetOverlays);

  const classes = useMemo(() => {
    const present = new Set(stars.map((star) => star.spectral.cls));
    return CLASS_LABELS.filter(([cls]) => present.has(cls));
  }, [stars]);
  const orbitStar = stars.find((star) => star.id === orbitStarId);
  const reference = stars.find((star) => star.id === referenceStarId);

  return (
    // A rail down the left: under the search box, and the full height of the screen while open,
    // so the timeline at its foot keeps to the corner. On a phone it's the bottom sheet instead,
    // with the timeline on top where a thumb reaches it.
    <aside aria-label="Map controls" className={`${RAIL_CLASS} ${open ? 'md:bottom-3' : ''}`}>
      <div className="shrink-0 px-3 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          {/* The lockup: the mark, then the wordmark; the heading's text is for screen readers. */}
          <h1 className="flex items-center gap-2.5 text-ink">
            <Logo size={26} />
            <Wordmark height={10} />
            <span className="sr-only">Stellar Atlas</span>
          </h1>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="rounded px-2 py-0.5 text-xs text-muted hover:bg-raised"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
        <p data-testid="visible-count" className="mt-1 text-xs text-muted">
          {visible.stars.toLocaleString('en')} stars in {visible.systems.toLocaleString('en')}{' '}
          systems
        </p>
        <p data-testid="orbit-target" className="text-xs text-muted">
          Orbit target: {orbitStar?.displayName ?? 'free'}
        </p>
        {reference && reference.id !== SOL_ID && (
          <p className="flex items-center justify-between text-xs text-warn">
            <span data-testid="reference-star">Distances from {reference.displayName}</span>
            <button
              type="button"
              onClick={() => setReference(SOL_ID)}
              className="rounded px-2 py-0.5 text-muted hover:bg-raised"
            >
              Back to Sol
            </button>
          </p>
        )}
        <p data-testid="label-count" className="text-xs text-muted">
          {labelCount} labels
        </p>
        {selectedCount > 0 && (
          <p className="flex items-center justify-between text-xs text-ink-soft">
            <span data-testid="selection-count">
              {selectedCount} system{selectedCount === 1 ? '' : 's'} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded px-2 py-0.5 text-muted hover:bg-raised"
            >
              Clear
            </button>
          </p>
        )}

        <RegionLegend />
      </div>

      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline px-3 pt-1 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-1rem),transparent)] max-md:max-h-[45dvh]">
          <div className="mt-2">
            <FieldHeading
              label="Radius"
              value={`${filters.radiusLy} ly`}
              reset={
                <ResetButton
                  name="radius"
                  to={`${DEFAULT_FILTERS.radiusLy} ly`}
                  isDefault={filters.radiusLy === DEFAULT_FILTERS.radiusLy}
                  onReset={() => setFilters({ radiusLy: DEFAULT_FILTERS.radiusLy })}
                />
              }
            />
            <Slider
              aria-label="Radius"
              min={MIN_RADIUS_LY}
              // Away from Sol, the far side of the catalogue is further off than its radius.
              max={MAX_RADIUS_LY + Math.ceil(reference?.distLy ?? 0)}
              step={1}
              value={filters.radiusLy}
              onChange={(event) => setFilters({ radiusLy: Number(event.target.value) })}
              className="block w-full"
            />
          </div>

          <Section
            title="Overlays"
            reset={
              <ResetButton
                name="overlays"
                to="their defaults"
                isDefault={OVERLAY_LABELS.every(
                  ([overlay]) => overlays[overlay] === DEFAULT_OVERLAYS[overlay],
                )}
                onReset={() => resetOverlays(OVERLAY_LABELS.map(([overlay]) => overlay))}
              />
            }
          >
            {OVERLAY_LABELS.map(([overlay, label]) => (
              <Check
                key={overlay}
                label={label}
                checked={overlays[overlay]}
                onChange={() => toggleOverlay(overlay)}
              />
            ))}
          </Section>

          <Section
            title="Spectral class"
            reset={
              <ResetButton
                name="spectral classes"
                to="show all"
                isDefault={filters.hiddenClasses.length === 0}
                onReset={() => setFilters({ hiddenClasses: DEFAULT_FILTERS.hiddenClasses })}
              />
            }
          >
            {classes.map(([cls, label, swatch]) => (
              <Check
                key={cls}
                label={label}
                swatch={swatch}
                checked={!filters.hiddenClasses.includes(cls)}
                onChange={() => toggleClass(cls)}
              />
            ))}
          </Section>

          <Section
            title="Exoplanets"
            reset={
              <ResetButton
                name="exoplanet filter"
                to="show all"
                isDefault={filters.planets === DEFAULT_FILTERS.planets}
                onReset={() => setFilters({ planets: DEFAULT_FILTERS.planets })}
              />
            }
          >
            {PLANET_LABELS.map(([planets, label]) => (
              <label key={planets} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="radio"
                  name="planet-filter"
                  checked={filters.planets === planets}
                  onChange={() => setFilters({ planets })}
                />
                {label}
              </label>
            ))}
          </Section>

          <Section
            title="Systems"
            reset={
              <ResetButton
                name="system filters"
                to="show all"
                isDefault={!filters.multipleOnly && !filters.taggedOnly}
                onReset={() =>
                  setFilters({
                    multipleOnly: DEFAULT_FILTERS.multipleOnly,
                    taggedOnly: DEFAULT_FILTERS.taggedOnly,
                  })
                }
              />
            }
          >
            <Check
              label="Multiple systems only"
              checked={filters.multipleOnly}
              onChange={() => setFilters({ multipleOnly: !filters.multipleOnly })}
            />
            <Check
              label="Tagged only"
              checked={filters.taggedOnly}
              onChange={() => setFilters({ taggedOnly: !filters.taggedOnly })}
            />
          </Section>

          <p className="mt-3 text-xs text-faint">
            Drag to orbit, right-drag to pan, scroll to zoom. Click a star to select it, shift-click
            to add more; <kbd>Esc</kbd> closes then clears. Double-click flies to a star;{' '}
            <kbd>H</kbd> returns to Sol; <kbd>/</kbd> searches; <kbd>R</kbd> plots a route;{' '}
            <kbd>A</kbd> finds one; <kbd>M</kbd> measures.
          </p>
        </div>
      )}

      <div className="shrink-0 border-t border-line max-md:order-first max-md:border-t-0 max-md:border-b">
        <TimelineBar />
      </div>
    </aside>
  );
}
