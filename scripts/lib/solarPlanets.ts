import type { Planet } from '../../src/types/catalogue';

export const SOLAR_FACT_SHEET_URL = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/';
export const SOLAR_FACT_SHEET_VERSION = '2025-03-18';
export const SOLAR_FACT_SHEET_FETCHED_AT = '2026-11-05T00:00:00.000Z';

export type SolarPlanet = Omit<Planet, 'id' | 'letter' | 'hostStarId' | 'inHabitableZone'>;

// The archive only lists planets of other stars, so ours are transcribed from NASA's Planetary
// Fact Sheet: mass and radius from its ratios to Earth, the rest from its metric table and each
// planet's own sheet (J2000 semi-major axis, black-body temperature). Listed from the Sun outwards,
// as that's how the catalogue keeps them.
export const SOLAR_PLANETS: readonly SolarPlanet[] = [
  {
    name: 'Mercury',
    massEarth: 0.0553,
    radiusEarth: 0.383,
    periodDays: 88,
    semiMajorAu: 0.387,
    eccentricity: 0.206,
    eqTempK: 439.6,
    discoveryMethod: 'Naked eye',
  },
  {
    name: 'Venus',
    massEarth: 0.815,
    radiusEarth: 0.949,
    periodDays: 224.7,
    semiMajorAu: 0.723,
    eccentricity: 0.007,
    eqTempK: 226.6,
    discoveryMethod: 'Naked eye',
  },
  {
    name: 'Earth',
    massEarth: 1,
    radiusEarth: 1,
    periodDays: 365.2,
    semiMajorAu: 1,
    eccentricity: 0.017,
    eqTempK: 254,
    discoveryMethod: 'Home',
  },
  {
    name: 'Mars',
    massEarth: 0.107,
    radiusEarth: 0.532,
    periodDays: 687,
    semiMajorAu: 1.524,
    eccentricity: 0.094,
    eqTempK: 209.8,
    discoveryMethod: 'Naked eye',
  },
  {
    name: 'Jupiter',
    massEarth: 317.8,
    radiusEarth: 11.21,
    periodDays: 4331,
    semiMajorAu: 5.203,
    eccentricity: 0.049,
    eqTempK: 109.9,
    discoveryMethod: 'Naked eye',
  },
  {
    name: 'Saturn',
    massEarth: 95.2,
    radiusEarth: 9.45,
    periodDays: 10747,
    semiMajorAu: 9.537,
    eccentricity: 0.052,
    eqTempK: 81,
    discoveryMethod: 'Naked eye',
  },
  {
    name: 'Uranus',
    massEarth: 14.5,
    radiusEarth: 4.01,
    periodDays: 30589,
    semiMajorAu: 19.191,
    eccentricity: 0.047,
    eqTempK: 58.1,
    discoveryMethod: 'Telescope',
    discoveryYear: 1781,
  },
  {
    name: 'Neptune',
    massEarth: 17.1,
    radiusEarth: 3.88,
    periodDays: 59800,
    semiMajorAu: 30.069,
    eccentricity: 0.01,
    eqTempK: 46.6,
    discoveryMethod: 'Telescope',
    discoveryYear: 1846,
  },
];
