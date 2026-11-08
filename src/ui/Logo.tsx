// The Stellar Atlas mark, after the pulsar map on the Pioneer plaques and Voyager records (Drake
// and Sagan): the Sun, a fan of pulsar lines and the one long line to the galactic centre. The fan
// is strict: eight lines evenly spaced outside a clear wedge round that line, in three lengths.
// Drawn in currentColor, so it takes the text colour. Below 20 px a heavier, four-line cut reads
// better, so it switches to that. public/logo.svg and public/favicon.svg are the same marks as files.
const FULL = {
  sun: { cx: 23, cy: 32, r: 5 },
  lines:
    'M32.5 32L61.4 32M30.277 25.894L37.555 19.787M24.65 22.644L27.081 8.857M18.25 23.773L15.75 19.443M14.073 28.751L0.917 23.963M14.073 35.249L5.146 38.498M18.25 40.227L11.25 52.352M24.65 41.356L25.518 46.28M30.277 38.106L37.555 44.213',
  width: 3.2,
} as const;

const SMALL = {
  sun: { cx: 22, cy: 32, r: 7 },
  lines:
    'M35.5 32L61 32M30.311 21.362L36.468 13.482M12.073 22.851L8.029 19.123M12.073 41.149L4.72 47.927M30.311 42.638L33.698 46.972',
  width: 5.4,
} as const;

const SMALL_BELOW_PX = 20;

export function Logo({
  size = 28,
  className = '',
}: {
  readonly size?: number;
  readonly className?: string;
}) {
  const mark = size < SMALL_BELOW_PX ? SMALL : FULL;
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={`shrink-0 ${className}`}
    >
      <circle {...mark.sun} fill="currentColor" />
      <path d={mark.lines} stroke="currentColor" strokeWidth={mark.width} strokeLinecap="round" />
    </svg>
  );
}
