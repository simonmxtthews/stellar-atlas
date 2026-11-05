import { useUi } from '../store/ui';
import { BUTTON_CLASS } from './controlStyles';

// The map doesn't look any different in itself, so nothing else says this isn't the present.
export function MapYearBanner({ surfaceClass }: { readonly surfaceClass: string }) {
  const yearsAhead = useUi((state) => state.yearsAhead);
  const setYearsAhead = useUi((state) => state.setYearsAhead);
  if (yearsAhead === 0) return null;
  const year = new Date().getFullYear() + yearsAhead;
  return (
    <div role="status" aria-label="Future view" className={`${surfaceClass} border-amber-400/60`}>
      <p data-testid="map-year" className="text-xs font-medium text-amber-200">
        Showing AD {year.toLocaleString('en')}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Stars are drawn where they will be. Distances, travel times and filters stay as of today.
      </p>
      <button type="button" onClick={() => setYearsAhead(0)} className={`${BUTTON_CLASS} mt-2`}>
        Back to today
      </button>
    </div>
  );
}
