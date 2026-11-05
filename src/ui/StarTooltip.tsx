import { distanceFromReference } from '../lib/filters';
import { formatValue, spectralCode } from '../lib/starFacts';
import { customNameOf, withCustomName } from '../lib/worldView';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';

const CURSOR_GAP_PX = 14;
const FLIP_MARGIN_PX = 240;

export function StarTooltip({ catalogue }: { readonly catalogue: Catalogue }) {
  const hover = useUi((state) => state.hover);
  const referenceStarId = useUi((state) => state.referenceStarId);
  const starMeta = useWorld((state) => state.world.starMeta);
  const star = hover && catalogue.starsById.get(hover.starId);
  if (!hover || !star) return null;
  const reference = catalogue.starsById.get(referenceStarId);
  const flipX = hover.x > window.innerWidth - FLIP_MARGIN_PX;
  return (
    <div
      role="tooltip"
      data-testid="star-tooltip"
      className="pointer-events-none fixed z-20 max-w-56 rounded border border-slate-700/60 bg-slate-950/90 px-2 py-1 text-xs text-slate-200"
      style={{
        left: hover.x + (flipX ? -CURSOR_GAP_PX : CURSOR_GAP_PX),
        top: hover.y + CURSOR_GAP_PX,
        transform: flipX ? 'translateX(-100%)' : undefined,
      }}
    >
      <div className="font-medium">
        {withCustomName(star.displayName, customNameOf(starMeta, star.id))}
      </div>
      <div className="text-slate-400">
        {spectralCode(star.spectral)} ·{' '}
        {formatValue(distanceFromReference(star, reference), 2, 'ly')} from{' '}
        {reference?.displayName ?? 'Sol'}
      </div>
    </div>
  );
}
