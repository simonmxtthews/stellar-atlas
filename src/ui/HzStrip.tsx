import { hzFraction, hzScale } from '../lib/hzStrip';
import type { Planet, Star } from '../types/catalogue';

const WIDTH = 320;
const HEIGHT = 44;
const AXIS_Y = 16;
const PADDING_X = 8;

function formatAu(au: number): string {
  return `${Number(au.toPrecision(2))} AU`;
}

interface HzStripProps {
  readonly star: Star;
  readonly planets: readonly Planet[];
}

// The habitable zone and planet orbits on one log axis of distance from the star.
export function HzStrip({ star, planets }: HzStripProps) {
  const orbiting = planets.flatMap((planet) =>
    planet.semiMajorAu === undefined ? [] : [{ planet, au: planet.semiMajorAu }],
  );
  const scale = hzScale(
    star.hzAu,
    orbiting.map(({ au }) => au),
  );
  if (!scale) return null;
  const toX = (au: number) => PADDING_X + hzFraction(au, scale) * (WIDTH - 2 * PADDING_X);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={
        star.hzAu
          ? `Habitable zone ${formatAu(star.hzAu[0])} to ${formatAu(star.hzAu[1])}, with ${orbiting.length} planet orbits`
          : `${orbiting.length} planet orbits; habitable zone unknown`
      }
      data-testid="hz-strip"
      className="mt-2 w-full"
    >
      <line
        x1={PADDING_X}
        x2={WIDTH - PADDING_X}
        y1={AXIS_Y}
        y2={AXIS_Y}
        className="stroke-line-strong"
      />
      {star.hzAu && (
        <rect
          data-testid="hz-zone"
          x={toX(star.hzAu[0])}
          width={toX(star.hzAu[1]) - toX(star.hzAu[0])}
          y={AXIS_Y - 7}
          height={14}
          rx={2}
          className="fill-habitable/35"
        />
      )}
      {orbiting.map(({ planet, au }) => (
        <circle key={planet.id} cx={toX(au)} cy={AXIS_Y} r={3.5} className="fill-accent">
          <title>{`${planet.name}: ${formatAu(au)}`}</title>
        </circle>
      ))}
      <text x={PADDING_X} y={HEIGHT - 4} className="fill-muted text-[10px]">
        {formatAu(scale.minAu)}
      </text>
      <text
        x={WIDTH - PADDING_X}
        y={HEIGHT - 4}
        textAnchor="end"
        className="fill-muted text-[10px]"
      >
        {formatAu(scale.maxAu)}
      </text>
    </svg>
  );
}
