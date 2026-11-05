import type { Spectral, SpectralClass, Star, StarNames } from '../types/catalogue';

const CLASS_COLOURS: Partial<Record<SpectralClass, string>> = {
  O: 'blue',
  B: 'blue-white',
  A: 'white',
  F: 'yellow-white',
  G: 'yellow',
  K: 'orange',
  M: 'red',
};

// Ranges like 'IV-V' and 'III/IV' read as their first class.
function lumClassReading(lumClass: string | undefined): string {
  const first = /^(?:VI|V|IV|III|II|I)/.exec(lumClass ?? '')?.[0];
  switch (first) {
    case 'I':
      return 'supergiant';
    case 'II':
      return 'bright giant';
    case 'III':
      return 'giant';
    case 'IV':
      return 'subgiant';
    case 'V':
      return 'main-sequence dwarf';
    case 'VI':
      return 'subdwarf';
    default:
      return 'star';
  }
}

export function spectralCode({ raw, cls, sub, lumClass }: Spectral): string {
  if (raw) return raw;
  if (cls === 'unknown') return 'Unknown';
  return `${cls}${sub ?? ''}${lumClass ? ` ${lumClass}` : ''}`;
}

export function spectralReading({ cls, lumClass }: Spectral): string {
  if (cls === 'unknown') return 'spectral type not catalogued';
  if (cls === 'D') return 'white dwarf';
  if (cls === 'L' || cls === 'T' || cls === 'Y') return 'brown dwarf';
  return `${CLASS_COLOURS[cls] ?? ''} ${lumClassReading(lumClass)}`.trim();
}

const NAME_FIELDS: readonly (keyof Omit<StarNames, 'other'>)[] = [
  'proper',
  'bayer',
  'flamsteed',
  'gliese',
  'hd',
  'hip',
  'hr',
];

// Every name the star goes by, without repeating its display name.
export function designations(star: Star): readonly string[] {
  const names = NAME_FIELDS.flatMap((field) => star.names[field] ?? []);
  return [...new Set([...names, ...star.names.other])].filter((name) => name !== star.displayName);
}

// Fixed decimals, or a dash when the value is unknown.
export function formatValue(value: number | undefined, decimals: number, unit = ''): string {
  if (value === undefined) return '—';
  const text = value.toLocaleString('en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${text} ${unit}` : text;
}

// Luminosities and masses span orders of magnitude, so keep significant figures, not decimals.
export function formatSignificant(value: number | undefined, unit: string): string {
  if (value === undefined) return '—';
  return `${Number(value.toPrecision(3)).toLocaleString('en', { maximumSignificantDigits: 3 })} ${unit}`;
}

export function archiveOverviewUrl(planetName: string, letter: string): string {
  const host = planetName.endsWith(` ${letter}`)
    ? planetName.slice(0, -(letter.length + 1))
    : planetName;
  return `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(host)}`;
}
