import type { Position } from '../../src/types/catalogue';

export const LY_PER_PC = 3.261564;

// J2000 equatorial (ICRS) to galactic rotation.
const EQ_TO_GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
] as const;

const DEG = Math.PI / 180;

export function equatorialToGalactic([x, y, z]: Position): Position {
  const [r0, r1, r2] = EQ_TO_GAL;
  return [
    r0[0] * x + r0[1] * y + r0[2] * z,
    r1[0] * x + r1[1] * y + r1[2] * z,
    r2[0] * x + r2[1] * y + r2[2] * z,
  ];
}

export function equatorialPcToGalacticLy(equatorialPc: Position): Position {
  const [x, y, z] = equatorialToGalactic(equatorialPc);
  return [x * LY_PER_PC, y * LY_PER_PC, z * LY_PER_PC];
}

export function raDecToEquatorial(raDeg: number, decDeg: number, dist: number): Position {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [
    dist * Math.cos(dec) * Math.cos(ra),
    dist * Math.cos(dec) * Math.sin(ra),
    dist * Math.sin(dec),
  ];
}

export function distance(a: Position, b: Position): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function angularSeparationArcsec(
  ra1Deg: number,
  dec1Deg: number,
  ra2Deg: number,
  dec2Deg: number,
): number {
  // Haversine, which stays accurate at the small separations cross-matching cares about.
  const dRa = (ra2Deg - ra1Deg) * DEG;
  const dDec = (dec2Deg - dec1Deg) * DEG;
  const h =
    Math.sin(dDec / 2) ** 2 +
    Math.cos(dec1Deg * DEG) * Math.cos(dec2Deg * DEG) * Math.sin(dRa / 2) ** 2;
  return ((2 * Math.asin(Math.min(1, Math.sqrt(h)))) / DEG) * 3600;
}
