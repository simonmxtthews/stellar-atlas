import { useMemo } from 'react';
import { systemsWithin } from '../lib/neighbours';
import { formatValue } from '../lib/starFacts';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import type { StarSystem } from '../types/catalogue';
import { ModalSection } from './ModalSection';

const MIN_RANGE_LY = 1;
const MAX_RANGE_LY = 50;

function RangeList({
  system,
  catalogue,
  radiusLy,
}: {
  readonly system: StarSystem;
  readonly catalogue: Catalogue;
  readonly radiusLy: number;
}) {
  const select = useUi((state) => state.select);
  const setRangeSphere = useUi((state) => state.setRangeSphere);
  const inside = useMemo(
    () => systemsWithin(system, catalogue.systems, radiusLy),
    [catalogue, radiusLy, system],
  );
  return (
    <ModalSection title="Range sphere">
      <label className="flex items-center gap-2 text-xs">
        Radius
        <input
          type="range"
          aria-label="Range sphere radius"
          min={MIN_RANGE_LY}
          max={MAX_RANGE_LY}
          step={1}
          value={radiusLy}
          onChange={(event) => setRangeSphere(Number(event.target.value))}
          className="min-w-0 flex-1 accent-sky-400"
        />
        <span className="tabular-nums">{radiusLy} ly</span>
      </label>
      <p data-testid="range-count" className="mt-1 text-xs text-slate-400">
        {inside.length} system{inside.length === 1 ? '' : 's'} inside
      </p>
      <ol aria-label="Systems in range" className="mt-1 max-h-48 overflow-y-auto">
        {inside.map(({ system: other, distanceLy }) => (
          <li key={other.id}>
            <button
              type="button"
              onClick={() => select(other.id)}
              className="flex w-full justify-between gap-3 rounded px-1 py-0.5 text-left hover:bg-slate-800"
            >
              <span className="truncate">{other.name}</span>
              <span className="text-slate-400 tabular-nums">
                {formatValue(distanceLy, 2, 'ly')}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </ModalSection>
  );
}

export function RangeSection({
  system,
  catalogue,
}: {
  readonly system: StarSystem;
  readonly catalogue: Catalogue;
}) {
  const radiusLy = useUi((state) => state.rangeSphereLy);
  if (radiusLy === null) return null;
  return <RangeList system={system} catalogue={catalogue} radiusLy={radiusLy} />;
}
