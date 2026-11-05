import { useMemo, useState, type ReactNode } from 'react';
import { MAX_RADIUS_LY, MIN_RADIUS_LY } from '../lib/filters';
import { useUi, type Overlays } from '../store/ui';
import type { SpectralClass, Star } from '../types/catalogue';

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
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-sky-400" />
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

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <fieldset className="mt-3">
      <legend className="mb-1 text-xs tracking-wide text-slate-400 uppercase">{title}</legend>
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
  const selectedCount = useUi((state) => state.selectedSystemIds.length);
  const clearSelection = useUi((state) => state.clearSelection);
  const labelCount = useUi((state) => state.labelCount);
  const setFilters = useUi((state) => state.setFilters);
  const toggleClass = useUi((state) => state.toggleClass);
  const toggleOverlay = useUi((state) => state.toggleOverlay);

  const classes = useMemo(() => {
    const present = new Set(stars.map((star) => star.spectral.cls));
    return CLASS_LABELS.filter(([cls]) => present.has(cls));
  }, [stars]);
  const orbitStar = stars.find((star) => star.id === orbitStarId);

  return (
    <aside
      aria-label="Map controls"
      className="absolute top-3 left-3 w-60 rounded-lg border border-slate-700/60 bg-slate-950/85 p-3 text-sm text-slate-200 backdrop-blur max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:w-auto max-md:rounded-b-none"
    >
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-medium">Stellar Atlas</h1>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      <p data-testid="visible-count" className="mt-1 text-xs text-slate-400">
        {visible.stars.toLocaleString('en')} stars in {visible.systems.toLocaleString('en')} systems
      </p>
      <p data-testid="orbit-target" className="text-xs text-slate-400">
        Orbit target: {orbitStar?.displayName ?? 'free'}
      </p>
      <p data-testid="label-count" className="text-xs text-slate-400">
        {labelCount} labels
      </p>
      {selectedCount > 0 && (
        <p className="flex items-center justify-between text-xs text-slate-300">
          <span data-testid="selection-count">
            {selectedCount} system{selectedCount === 1 ? '' : 's'} selected
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded px-2 py-0.5 text-slate-400 hover:bg-slate-800"
          >
            Clear
          </button>
        </p>
      )}

      {open && (
        <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto max-md:max-h-[45dvh]">
          <label className="mt-3 block">
            <span className="flex justify-between text-xs tracking-wide text-slate-400 uppercase">
              Radius <span className="tracking-normal normal-case">{filters.radiusLy} ly</span>
            </span>
            <input
              type="range"
              aria-label="Radius"
              min={MIN_RADIUS_LY}
              max={MAX_RADIUS_LY}
              step={1}
              value={filters.radiusLy}
              onChange={(event) => setFilters({ radiusLy: Number(event.target.value) })}
              className="mt-1 w-full accent-sky-400"
            />
          </label>

          <Section title="Overlays">
            {OVERLAY_LABELS.map(([overlay, label]) => (
              <Check
                key={overlay}
                label={label}
                checked={overlays[overlay]}
                onChange={() => toggleOverlay(overlay)}
              />
            ))}
          </Section>

          <Section title="Spectral class">
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

          <Section title="Systems">
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
          </Section>

          <p className="mt-3 text-xs text-slate-500">
            Drag to orbit, right-drag to pan, scroll to zoom. Click a star to select it, shift-click
            to add more; <kbd>Esc</kbd> closes then clears. Double-click flies to a star;{' '}
            <kbd>H</kbd> returns to Sol.
          </p>
        </div>
      )}
    </aside>
  );
}
