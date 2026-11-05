export interface LogScale {
  readonly minAu: number;
  readonly maxAu: number;
}

const PADDING = 1.6; // multiplicative margin either side of the outermost values

// A log axis, since one strip has to span close-in planets and wide orbits. Null with no values.
export function hzScale(
  hzAu: readonly [number, number] | undefined,
  planetsAu: readonly number[],
): LogScale | null {
  const values = [...(hzAu ?? []), ...planetsAu].filter((au) => au > 0);
  if (values.length === 0) return null;
  return { minAu: Math.min(...values) / PADDING, maxAu: Math.max(...values) * PADDING };
}

// Position along the axis, 0 to 1.
export function hzFraction(au: number, { minAu, maxAu }: LogScale): number {
  return Math.log(au / minAu) / Math.log(maxAu / minAu);
}
