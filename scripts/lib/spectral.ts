import type { Spectral, SpectralClass } from '../../src/types/catalogue';

const CLASS_ORDER = 'OBAFGKMLTY';

// Approximate dwarf effective temperatures, after Pecaut & Mamajek (2013), keyed by
// class index * 10 + subclass.
const TEMP_BY_CODE: readonly (readonly [number, number])[] = [
  [5, 42000],
  [9, 33000],
  [10, 30000],
  [15, 15700],
  [20, 9700],
  [25, 8080],
  [30, 7220],
  [35, 6550],
  [40, 5930],
  [45, 5660],
  [50, 5270],
  [55, 4440],
  [60, 3850],
  [62, 3550],
  [64, 3200],
  [65, 3060],
  [66, 2810],
  [68, 2570],
  [69, 2400],
  [70, 2250],
  [75, 1590],
  [80, 1300],
  [85, 1100],
  [89, 550],
  [90, 450],
  [94, 300],
];

const CLASS_COLOURS: Readonly<Record<SpectralClass, string>> = {
  O: '#9bb0ff',
  B: '#aabfff',
  A: '#cad7ff',
  F: '#f8f7ff',
  G: '#fff4ea',
  K: '#ffd2a1',
  M: '#ffb56c',
  L: '#ff8a5c',
  T: '#d9607a',
  Y: '#8a5a9e',
  D: '#e8eeff',
  unknown: '#c8c8c8',
};

const LUMINOSITY_CLASS = /(Iab|Ia|Ib|III|II|IV|VI|V|I)(?:[-/](III|II|IV|VI|V))?/;

export function interpolate(table: readonly (readonly [number, number])[], x: number): number {
  const first = table[0];
  const last = table[table.length - 1];
  if (!first || !last) throw new Error('interpolate: empty table');
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const hi = table[i];
    const lo = table[i - 1];
    if (hi && lo && x <= hi[0]) return lo[1] + ((x - lo[0]) / (hi[0] - lo[0])) * (hi[1] - lo[1]);
  }
  return last[1];
}

function stripUncertainty(raw: string): string {
  return raw.replace(/\s*(?:±|\+\/-)\s*[\d.]+/g, '');
}

function parseSubclass(text: string): number | undefined {
  const match = /^\(?\s*(\d+(?:\.\d+)?)/.exec(text);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/**
 * Reads the first (brightest) component of a spectral string. HYG mixes MK types with
 * Gliese-era shorthand: `dM5.5e` (dwarf), `sdM4` (subdwarf), `gK0` (giant), and a bare
 * lowercase `m` or `k-m` for stars classified from colour alone.
 */
export function parseSpectral(raw: string | undefined): Spectral {
  const trimmed = raw?.trim();
  if (!trimmed) return { cls: 'unknown' };

  const text = stripUncertainty(trimmed).split('+')[0]?.trim() ?? '';

  if (/^(?:WD|wd|D)/.test(text)) {
    const sub = /^(?:WD|wd|D)[A-Za-z]*\s*(\d+(?:\.\d+)?)/.exec(text)?.[1];
    return { raw: trimmed, cls: 'D', ...(sub === undefined ? {} : { sub: Number(sub) }) };
  }

  const prefix = /^(esd|sd|sg|d|g)(?=[OBAFGKM])/.exec(text)?.[1];
  const body = prefix ? text.slice(prefix.length) : text;

  // A lowercase letter is a class only when nothing else could follow it: `m`, `k-m`, `m3 V`.
  const letter = /^[obafgkmlty](?=$|[\d\s+-])/.test(body)
    ? body.charAt(0).toUpperCase()
    : body.charAt(0);
  if (!letter || !CLASS_ORDER.includes(letter)) return { raw: trimmed, cls: 'unknown' };

  const rest = body.slice(1);
  const sub = parseSubclass(rest);
  const prefixLumClass =
    prefix === 'd'
      ? 'V'
      : prefix === 'g'
        ? 'III'
        : prefix === 'sg'
          ? 'IV'
          : prefix
            ? 'VI'
            : undefined;
  const lumClass = prefixLumClass ?? LUMINOSITY_CLASS.exec(rest)?.[0];

  return {
    raw: trimmed,
    cls: letter as SpectralClass,
    ...(sub === undefined ? {} : { sub }),
    ...(lumClass === undefined ? {} : { lumClass }),
  };
}

/** Ballesteros (2012) B−V to effective temperature. */
export function bvToTemperature(bv: number): number {
  const clamped = Math.min(2.2, Math.max(-0.4, bv));
  return 4600 * (1 / (0.92 * clamped + 1.7) + 1 / (0.92 * clamped + 0.62));
}

export function spectralTemperature({ cls, sub }: Spectral): number | undefined {
  if (cls === 'unknown') return undefined;
  // White-dwarf subclasses are defined as 50400 K / Teff.
  if (cls === 'D') return sub ? 50400 / sub : 10000;
  const defaultSub = cls === 'M' ? 3 : 5;
  return interpolate(TEMP_BY_CODE, CLASS_ORDER.indexOf(cls) * 10 + (sub ?? defaultSub));
}

/** Tanner Helland's blackbody fit, good enough for display colour. */
export function temperatureToHex(tempK: number): string {
  const t = Math.min(40000, Math.max(1000, tempK)) / 100;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

export function classColour(cls: SpectralClass): string {
  return CLASS_COLOURS[cls];
}
