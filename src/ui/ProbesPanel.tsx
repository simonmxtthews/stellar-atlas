import { useMemo, useState } from 'react';
import { SOL_ID } from '../lib/filters';
import { closestApproaches, MAX_YEARS_AHEAD, PROBE_COLORS, probePositionAt } from '../lib/probes';
import { distanceLy } from '../lib/routes';
import { formatValue } from '../lib/starFacts';
import type { Catalogue } from '../store/catalogue';
import { DEFAULT_OVERLAYS, useUi } from '../store/ui';
import type { Probe } from '../types/catalogue';
import { ResetButton } from './ResetButton';
import { Slider } from './Slider';
import { YearControl } from './YearControl';

const DEFAULT_APPROACH_LY = 3;
const MIN_APPROACH_LY = 0.5;
const MAX_APPROACH_LY = 10;

function formatYear(year: number): string {
  return String(Math.round(year));
}

function Approaches({
  probe,
  color,
  catalogue,
  withinLy,
}: {
  readonly probe: Probe;
  readonly color: string;
  readonly catalogue: Catalogue;
  readonly withinLy: number;
}) {
  const select = useUi((state) => state.select);
  const { systems, probeData } = catalogue;
  const approaches = useMemo(
    () =>
      closestApproaches(
        probe,
        probeData.epochYear,
        systems.filter((system) => !system.starIds.includes(SOL_ID)),
        withinLy,
      ),
    [probe, probeData, systems, withinLy],
  );
  return (
    <section aria-label={`${probe.name} closest approaches`} className="mt-2">
      <h3 className="text-xs font-medium" style={{ color }}>
        {probe.name}
      </h3>
      {approaches.length === 0 ? (
        <p className="text-xs text-muted">None within {withinLy} ly</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="font-normal">
                System
              </th>
              <th scope="col" className="text-right font-normal">
                Closest
              </th>
              <th scope="col" className="text-right font-normal">
                Year
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {approaches.map(({ system, distanceLy: closest, year, rough }) => (
              <tr key={system.id} className="border-t border-hairline">
                <td className="py-0.5">
                  <button
                    type="button"
                    onClick={() => select(system.id)}
                    className="rounded px-1 text-left hover:bg-raised"
                  >
                    {system.name}
                  </button>
                </td>
                <td className="text-right">
                  {rough && <span title="Rough: incomplete motion data">≈</span>}
                  {formatValue(closest, 2, 'ly')}
                </td>
                <td className="text-right">{formatYear(year)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ProbesPanel({ catalogue }: { readonly catalogue: Catalogue }) {
  const overlays = useUi((state) => state.overlays);
  const toggleOverlay = useUi((state) => state.toggleOverlay);
  const yearsAhead = useUi((state) => state.yearsAhead);
  const resetOverlays = useUi((state) => state.resetOverlays);
  const [withinLy, setWithinLy] = useState(DEFAULT_APPROACH_LY);
  const { probes, epochYear } = catalogue.probeData;
  const thisYear = new Date().getFullYear();
  const year = thisYear + yearsAhead;
  return (
    <>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={overlays.probes} onChange={() => toggleOverlay('probes')} />
        Show probe trajectories
      </label>
      <label className="mt-1 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={overlays.pulsars}
          onChange={() => toggleOverlay('pulsars')}
        />
        Show pulsar map (Golden Record periods)
      </label>
      <div className="mt-1">
        <ResetButton
          name="probe and pulsar display"
          to="off"
          isDefault={
            overlays.probes === DEFAULT_OVERLAYS.probes &&
            overlays.pulsars === DEFAULT_OVERLAYS.pulsars
          }
          onReset={() => resetOverlays(['probes', 'pulsars'])}
        />
      </div>

      <div className="mt-3">
        <YearControl sliderName="Probe year" testId="probe-year" />
      </div>
      <table className="mt-1 w-full text-left text-xs tabular-nums">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="font-normal">
              Probe
            </th>
            <th scope="col" className="text-right font-normal">
              From Sol
            </th>
            <th scope="col" className="text-right font-normal">
              Travelled
            </th>
          </tr>
        </thead>
        <tbody>
          {probes.map((probe, i) => {
            const now = probePositionAt(probe, epochYear, thisYear);
            const then = probePositionAt(probe, epochYear, year);
            return (
              <tr key={probe.id} data-testid="probe-row" className="border-t border-hairline">
                <th scope="row" className="py-0.5 font-normal" style={{ color: PROBE_COLORS[i] }}>
                  {probe.name}
                </th>
                <td className="text-right">{formatValue(Math.hypot(...then), 3, 'ly')}</td>
                <td className="text-right">{formatValue(distanceLy(now, then), 3, 'ly')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="mt-3 section-label">Closest approaches</h2>
      <label className="mt-1 flex items-center gap-2 text-xs">
        Within
        <Slider
          aria-label="Approach distance"
          min={MIN_APPROACH_LY}
          max={MAX_APPROACH_LY}
          step={0.5}
          value={withinLy}
          onChange={(event) => setWithinLy(Number(event.target.value))}
          className="min-w-0 flex-1"
        />
        <span className="tabular-nums">{withinLy} ly</span>
      </label>
      <div className="mt-1">
        <ResetButton
          name="approach distance"
          to={`${DEFAULT_APPROACH_LY} ly`}
          isDefault={withinLy === DEFAULT_APPROACH_LY}
          onReset={() => setWithinLy(DEFAULT_APPROACH_LY)}
        />
      </div>
      <p data-testid="approach-note" className="mt-1 text-xs text-muted">
        Over the next {MAX_YEARS_AHEAD.toLocaleString('en')} years, with each star moving in a
        straight line at its catalogue velocity. ≈ marks a star with no radial velocity or no motion
        on record, so its figures are rough. Year moves the map's stars to match.
      </p>
      {probes.map((probe, i) => (
        <Approaches
          key={probe.id}
          probe={probe}
          color={PROBE_COLORS[i] ?? PROBE_COLORS[0]}
          catalogue={catalogue}
          withinLy={withinLy}
        />
      ))}
    </>
  );
}
