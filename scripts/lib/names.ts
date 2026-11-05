import { CONSTELLATION_GENITIVE, GREEK } from '../../src/lib/starNames';
import type { StarNames } from '../../src/types/catalogue';

const NUMBERED_BAYER = /^([A-Z][a-z]+)-\d+ /;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `Alp-1` + `Cen` becomes `Alpha-1 Centauri`. */
export function formatBayer(bayer: string, con: string): string | undefined {
  const [letter = '', index] = bayer.split('-');
  const greek = GREEK[letter];
  const genitive = CONSTELLATION_GENITIVE[con];
  if (!greek || !genitive) return undefined;
  return `${greek}${index ? `-${index}` : ''} ${genitive}`;
}

/** `Alpha-1 Centauri` becomes `Alpha Centauri`; undefined when the letter has no number. */
export function unnumberedBayer(bayer: string): string | undefined {
  const unnumbered = bayer.replace(NUMBERED_BAYER, '$1 ');
  return unnumbered === bayer ? undefined : unnumbered;
}

export function formatFlamsteed(flam: string, con: string): string | undefined {
  const genitive = CONSTELLATION_GENITIVE[con];
  return genitive ? `${flam} ${genitive}` : undefined;
}

export function isGreekAbbreviation(text: string): boolean {
  return text in GREEK;
}

export interface GlieseKey {
  readonly base: string; // e.g. 'gj57.1'
  readonly suffix: string; // e.g. 'a', or '' for no component letter
}

/** Parses `Gl  15A`, `GJ 15 A` or `Gliese 15` to one key; undefined for anything else. */
export function parseGliese(name: string): GlieseKey | undefined {
  const match = /^(?:gl|gj|gliese)\s*(\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(name.trim());
  if (!match) return undefined;
  return { base: `gj${match[1]}`, suffix: (match[2] ?? '').toLowerCase() };
}

/** Normalises HYG's `Gl  15A` to `GJ 15 A`. */
export function formatGliese(name: string): string {
  const key = parseGliese(name);
  if (!key) return name.trim().replace(/\s+/g, ' ');
  return `GJ ${key.base.slice(2)}${key.suffix ? ` ${key.suffix.toUpperCase()}` : ''}`;
}

export function pickDisplayName(names: StarNames, fallback: string): string {
  return (
    names.proper ??
    names.bayer ??
    names.flamsteed ??
    names.gliese ??
    names.hd ??
    names.hip ??
    names.other[0] ??
    fallback
  );
}

/**
 * Names a multiple system after its primary, without what distinguishes the component. A numbered
 * Bayer letter beats a proper name, because Alpha Centauri is known by the system name and not by
 * Rigil Kentaurus; an unnumbered one doesn't, because nobody says Alpha Canis Majoris for Sirius.
 */
export function systemNameFromPrimary(names: StarNames, displayName: string): string {
  const unnumbered = names.bayer && unnumberedBayer(names.bayer);
  return unnumbered || displayName.replace(/ [A-C]$/, '');
}
