import { useWorld } from '../store/world';

// In the map controls, so that it holds its place on every screen size.
export function RegionLegend() {
  const regions = useWorld((state) => state.world.regions);
  if (regions.length === 0) return null;
  return (
    <ul
      aria-label="Region legend"
      className="mt-2 flex max-h-20 flex-wrap gap-x-3 gap-y-0.5 overflow-y-auto text-xs"
    >
      {regions.map((region) => (
        <li key={region.id} className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full"
            style={{ background: region.color }}
          />
          {region.name}
          <span className="text-slate-400 tabular-nums">{region.systemIds.length}</span>
        </li>
      ))}
    </ul>
  );
}
