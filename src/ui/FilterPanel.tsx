import { useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_FILTERS, MAX_RADIUS_LY, MIN_RADIUS_LY, SOL_ID } from '../lib/filters';
import { DEFAULT_OVERLAYS, useUi, type Overlays } from '../store/ui';
import type { SpectralClass, Star } from '../types/catalogue';
import { RegionLegend } from './RegionLegend';
import { ResetButton } from './ResetButton';
import { Slider } from './Slider';

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
      <legend className="mb-1 flex w-full items-center justify-between text-xs">
        <span className="section-label">{title}</span>
        {reset}
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
    <aside
      aria-label="Map controls"
      className="absolute top-16 left-3 w-60 rounded-xl border border-line shadow-panel bg-panel p-3 text-sm text-ink backdrop-blur max-md:static max-md:w-auto max-md:rounded-none"
    >
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-medium tracking-tight">Stellar Atlas</h1>
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
        {visible.stars.toLocaleString('en')} stars in {visible.systems.toLocaleString('en')} systems
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

      {open && (
        <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto max-md:max-h-[45dvh]">
          <div className="mt-3 flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="flex justify-between section-label">
                Radius <span className="tracking-normal normal-case">{filters.radiusLy} ly</span>
              </span>
              <Slider
                aria-label="Radius"
                min={MIN_RADIUS_LY}
                // Away from Sol, the far side of the catalogue is further off than its radius.
                max={MAX_RADIUS_LY + Math.ceil(reference?.distLy ?? 0)}
                step={1}
                value={filters.radiusLy}
                onChange={(event) => setFilters({ radiusLy: Number(event.target.value) })}
                className="w-full"
              />
            </label>
            <ResetButton
              name="radius"
              to={`${DEFAULT_FILTERS.radiusLy} ly`}
              isDefault={filters.radiusLy === DEFAULT_FILTERS.radiusLy}
              onReset={() => setFilters({ radiusLy: DEFAULT_FILTERS.radiusLy })}
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
            title="Systems"
            reset={
              <ResetButton
                name="system filters"
                to="show all"
                isDefault={!filters.hasPlanets && !filters.multipleOnly && !filters.taggedOnly}
                onReset={() =>
                  setFilters({
                    hasPlanets: DEFAULT_FILTERS.hasPlanets,
                    multipleOnly: DEFAULT_FILTERS.multipleOnly,
                    taggedOnly: DEFAULT_FILTERS.taggedOnly,
                  })
                }
              />
            }
          >
            <Check
              label="Has planets"
              checked={filters.hasPlanets}
              onChange={() => setFilters({ hasPlanets: !filters.hasPlanets })}
            />
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
    </aside>
  );
}
