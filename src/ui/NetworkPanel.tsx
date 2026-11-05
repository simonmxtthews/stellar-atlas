import { useEffect, useMemo, useRef, useState } from 'react';
import { cachedJumpGraph, componentColor, connectedComponents, type Hub } from '../lib/graph';
import type { HubRequest } from '../lib/hubs.worker';
import { formatValue } from '../lib/starFacts';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import type { StarSystem } from '../types/catalogue';
import { BUTTON_CLASS } from './controlStyles';

const HUB_LIMIT = 10;
const LEGEND_LIMIT = 8;

interface HubRun {
  readonly systems: readonly StarSystem[];
  readonly maxJumpLy: number;
  readonly hubs: readonly Hub[] | null; // null while the worker runs
  readonly failed?: boolean;
}

// A run belongs to one network: when the visible set or max jump moves on, its answer no longer
// applies. A worker still at it finishes, in case the network comes back, unless another starts.
function useHubRanking(systems: readonly StarSystem[], maxJumpLy: number) {
  const worker = useRef<Worker | null>(null);
  const [run, setRun] = useState<HubRun | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const start = () => {
    worker.current?.terminate();
    const next = new Worker(new URL('../lib/hubs.worker.ts', import.meta.url), { type: 'module' });
    worker.current = next;
    setRun({ systems, maxJumpLy, hubs: null });
    next.onmessage = ({ data }: MessageEvent<readonly Hub[]>) => {
      setRun({ systems, maxJumpLy, hubs: data });
      next.terminate();
    };
    next.onerror = () => {
      setRun({ systems, maxJumpLy, hubs: [], failed: true });
      next.terminate();
    };
    const request: HubRequest = {
      nodes: systems.map(({ id, pos }) => ({ id, pos })),
      maxJumpLy,
      limit: HUB_LIMIT,
    };
    next.postMessage(request);
  };

  const current = run?.systems === systems && run.maxJumpLy === maxJumpLy ? run : null;
  return { current, start };
}

function Hubs({
  catalogue,
  systems,
  maxJumpLy,
}: {
  readonly catalogue: Catalogue;
  readonly systems: readonly StarSystem[];
  readonly maxJumpLy: number;
}) {
  const select = useUi((state) => state.select);
  const { current, start } = useHubRanking(systems, maxJumpLy);
  const running = current !== null && current.hubs === null;
  return (
    <div className="mt-3">
      <h2 className="text-xs tracking-wide text-slate-400 uppercase">Hub finder</h2>
      <p className="mt-1 text-xs text-slate-400">
        Chokepoints: the share of shortest paths between other systems that pass through each one.
      </p>
      <button type="button" disabled={running} onClick={start} className={`${BUTTON_CLASS} mt-1`}>
        {running ? 'Ranking…' : 'Rank hubs'}
      </button>
      {current?.failed && (
        <p role="alert" className="mt-1 text-xs text-rose-300">
          The ranking failed.
        </p>
      )}
      {current?.hubs && !current.failed && current.hubs.length === 0 && (
        <p className="mt-1 text-xs text-slate-400">No system links any others at this max jump.</p>
      )}
      {current?.hubs && current.hubs.length > 0 && (
        <ol aria-label="Hubs" className="mt-1">
          {current.hubs.map(({ id, score }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => select(id)}
                className="flex w-full justify-between gap-3 rounded px-1 py-0.5 text-left text-xs hover:bg-slate-800"
              >
                <span className="truncate">{catalogue.systemsById.get(id)?.name ?? id}</span>
                <span className="text-slate-400 tabular-nums">{formatValue(score * 100, 1)}%</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NetworkDetails({
  catalogue,
  systems,
  maxJumpLy,
}: {
  readonly catalogue: Catalogue;
  readonly systems: readonly StarSystem[];
  readonly maxJumpLy: number;
}) {
  const { links, sizes } = useMemo(() => {
    const graph = cachedJumpGraph(systems, maxJumpLy);
    return { links: graph.links.length / 2, sizes: connectedComponents(graph).sizes };
  }, [maxJumpLy, systems]);
  const clusters = sizes.filter((size) => size > 1);
  const isolated = sizes.length - clusters.length;
  return (
    <>
      <p data-testid="network-stats" className="mt-2 text-xs text-slate-400 tabular-nums">
        {systems.length.toLocaleString('en')} systems, {links.toLocaleString('en')} links within{' '}
        {maxJumpLy} ly: {clusters.length} cluster{clusters.length === 1 ? '' : 's'}, {isolated}{' '}
        isolated
      </p>
      <ul
        aria-label="Largest clusters"
        className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums"
      >
        {clusters.slice(0, LEGEND_LIMIT).map((size, rank) => (
          <li key={rank} className="flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block size-2 rounded-full"
              style={{ background: componentColor(rank) }}
            />
            {size}
          </li>
        ))}
      </ul>
      <Hubs catalogue={catalogue} systems={systems} maxJumpLy={maxJumpLy} />
    </>
  );
}

export function NetworkPanel({
  catalogue,
  visibleSystems,
}: {
  readonly catalogue: Catalogue;
  readonly visibleSystems: readonly StarSystem[];
}) {
  const shown = useUi((state) => state.overlays.jumpNetwork);
  const toggleOverlay = useUi((state) => state.toggleOverlay);
  const drive = useWorld((state) => state.world.drive);
  if (drive.type !== 'jump') {
    return (
      <p className="text-xs text-slate-400">
        The jump network, hub finder and auto-route follow a jump drive&apos;s max jump. Choose a
        jump drive in the Drive panel to use them.
      </p>
    );
  }
  return (
    <>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={shown}
          onChange={() => toggleOverlay('jumpNetwork')}
          className="accent-sky-400"
        />
        Show jump network
      </label>
      <NetworkDetails catalogue={catalogue} systems={visibleSystems} maxJumpLy={drive.maxJumpLy} />
    </>
  );
}
