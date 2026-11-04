import type { Spectral } from '../../src/types/catalogue';
import { interpolate } from './spectral';

const SOLAR_MBOL = 4.74;

// Approximate V-band bolometric correction by temperature, after Pecaut & Mamajek (2013). HYG's `lum`
// comes straight from absolute V magnitude, which undercounts red dwarfs by more than an order
// of magnitude and would push every M-dwarf habitable zone inward of its real position.
const BC_BY_TEMP: readonly (readonly [number, number])[] = [
  [2400, -5.4],
  [2800, -4.3],
  [3060, -3.6],
  [3200, -2.9],
  [3400, -2.2],
  [3550, -1.8],
  [3850, -1.2],
  [4440, -0.7],
  [5270, -0.19],
  [5770, -0.07],
  [6500, 0],
  [7220, -0.02],
  [8080, -0.1],
  [9700, -0.25],
  [15700, -1.3],
  [20000, -2],
  [30000, -3],
  [50000, -4.3],
];

// Above these luminosities a star with no stated luminosity class is unlikely to be on the main
// sequence, so its mass is left unestimated.
const MAX_MAIN_SEQUENCE_LUM: Partial<Record<Spectral['cls'], number>> = {
  O: Infinity,
  B: 30000,
  A: 100,
  F: 10,
  G: 2.5,
  K: 0.7,
  M: 0.1,
};

export function bolometricLuminosity(absMagV: number, tempK: number): number {
  const mbol = absMagV + interpolate(BC_BY_TEMP, tempK);
  return 10 ** (-0.4 * (mbol - SOLAR_MBOL));
}

export function isMainSequence({ cls, lumClass }: Spectral, lumSolar: number): boolean {
  const limit = MAX_MAIN_SEQUENCE_LUM[cls];
  if (limit === undefined) return false;
  return lumClass === undefined ? lumSolar < limit : lumClass === 'V';
}

/** Inverts the piecewise main-sequence mass–luminosity relation. */
export function massFromLuminosity(lumSolar: number): number {
  if (lumSolar < 0.033) return (lumSolar / 0.23) ** (1 / 2.3);
  if (lumSolar < 16) return lumSolar ** (1 / 4);
  if (lumSolar < 1.4 * 55 ** 3.5) return (lumSolar / 1.4) ** (1 / 3.5);
  return lumSolar / 32000;
}

/** Conservative habitable zone: runaway greenhouse to maximum greenhouse (Kasting et al. 1993). */
export function habitableZone(lumSolar: number): readonly [inner: number, outer: number] {
  return [Math.sqrt(lumSolar / 1.1), Math.sqrt(lumSolar / 0.53)];
}
