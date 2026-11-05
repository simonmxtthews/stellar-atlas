import MiniSearch, { type SearchOptions } from 'minisearch';
import type { Star, StarNames, StarSystem } from '../types/catalogue';
import type { StarMeta, Tag } from '../types/world';
import { CONSTELLATION_GENITIVE, CONSTELLATION_NOMINATIVE, GREEK } from './starNames';

const RESULT_LIMIT = 10;
const FUZZINESS = 0.2;

const GREEK_SYMBOLS: Readonly<Record<string, string>> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'epsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  ο: 'omicron',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  ς: 'sigma',
  τ: 'tau',
  υ: 'upsilon',
  φ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
};

// Every spelling of each letter, including the alf, tet and ksi forms SIMBAD uses.
const GREEK_FORMS = new Map<string, readonly string[]>();
for (const [abbreviation, name] of Object.entries(GREEK)) {
  const forms = [name.toLowerCase(), abbreviation.toLowerCase()];
  if (name === 'Alpha') forms.push('alf');
  if (name === 'Theta') forms.push('tet');
  if (name === 'Xi') forms.push('ksi');
  for (const form of forms) GREEK_FORMS.set(form, forms);
}

const GREEK_PATTERN = [...GREEK_FORMS.keys()].join('|');
const NUMBERED_GREEK = new RegExp(`\\b(${GREEK_PATTERN}) (\\d)\\b`, 'g');
const GREEK_WORD = new RegExp(`^(${GREEK_PATTERN})(\\d?)$`);

const GLIESE_FORMS = ['gj', 'gl', 'gliese'];
const CATALOGUE_WORD = /^(gj|hd|hip|hr)(\d[\d.]*)([a-z]?)$/;

function plainText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[α-ω]/g, (symbol) => `${GREEK_SYMBOLS[symbol] ?? symbol} `)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
}

/**
 * The words of a name or query in one spelling: `α1 Cen` becomes `alpha1 cen`, and `Gliese 559 A`,
 * `gl559a` and `GJ 559 A` all become `gj559a`. A dot stays only inside a number (`GJ 508.1`).
 */
export function normaliseWords(text: string): readonly string[] {
  return plainText(text)
    .replace(NUMBERED_GREEK, '$1$2')
    .replace(/\b(?:gliese|gl|gj) ?(?=\d)/g, 'gj')
    .replace(/\b(hd|hip|hr) (?=\d)/g, '$1')
    .replace(/\b((?:gj|hd|hip|hr)\d[\d.]*) ([a-z])\b/g, '$1$2')
    .split(' ')
    .filter(Boolean);
}

function words(text: string): readonly string[] {
  return plainText(text).split(' ').filter(Boolean);
}

// All the forms of a constellation, keyed by each form. Abbreviations are separate, as they only
// count after the first word: the `Tau` of `Tau Ceti` is the Greek letter, not Taurus.
const CONSTELLATION_NAMES = new Map<string, readonly string[]>();
const CONSTELLATION_ABBREVIATIONS = new Map<string, readonly string[]>();
for (const [abbreviation, genitive] of Object.entries(CONSTELLATION_GENITIVE)) {
  const nominative = CONSTELLATION_NOMINATIVE[abbreviation] ?? genitive;
  const lower = abbreviation.toLowerCase();
  const terms = [lower, ...words(genitive), ...words(nominative)];
  CONSTELLATION_NAMES.set(words(genitive).join(' '), terms);
  CONSTELLATION_NAMES.set(words(nominative).join(' '), terms);
  CONSTELLATION_ABBREVIATIONS.set(lower, terms);
}

function addCatalogueTerms(terms: Set<string>, match: RegExpExecArray): void {
  const [, prefix = '', number = '', component = ''] = match;
  const prefixes = prefix === 'gj' ? GLIESE_FORMS : [prefix];
  for (const form of prefixes) terms.add(form);
  terms.add(`${prefix}${number}`);
  terms.add(number);
  if (component) {
    terms.add(component);
    terms.add(`${prefix}${number}${component}`);
    terms.add(`${number}${component}`);
  }
}

/** Every term that should find a star under this name, so that queries need no rewriting. */
export function aliasTerms(name: string): readonly string[] {
  const parts = normaliseWords(name);
  const terms = new Set(parts);
  parts.forEach((word, i) => {
    const greek = GREEK_WORD.exec(word);
    if (greek) {
      const [, letter = '', index = ''] = greek;
      for (const form of GREEK_FORMS.get(letter) ?? []) {
        terms.add(form);
        if (index) terms.add(`${form}${index}`);
      }
    }

    const catalogue = CATALOGUE_WORD.exec(word);
    if (catalogue) addCatalogueTerms(terms, catalogue);

    // `J085510.83` is also found as `0855`.
    if (/^j\d/.test(word)) terms.add(word.slice(1));

    // `Ross 128` is also found as `ross128`.
    const next = parts[i + 1];
    if (next && /^[a-z]+$/.test(word) && /^\d/.test(next)) terms.add(`${word}${next}`);

    const pair = next === undefined ? undefined : `${word} ${next}`;
    const constellation =
      CONSTELLATION_NAMES.get(word) ??
      (pair === undefined ? undefined : CONSTELLATION_NAMES.get(pair)) ??
      (i > 0 ? CONSTELLATION_ABBREVIATIONS.get(word) : undefined);
    for (const term of constellation ?? []) terms.add(term);
  });
  return [...terms];
}

function catalogueNames(names: StarNames): readonly string[] {
  return [
    names.proper,
    names.bayer,
    names.flamsteed,
    names.gliese,
    names.hd,
    names.hip,
    names.hr,
    ...names.other,
  ].filter((name) => name !== undefined);
}

export interface StarSearch {
  readonly index: MiniSearch<Star>;
  readonly starsById: ReadonlyMap<string, Star>;
  readonly worldIndex?: MiniSearch<WorldEntry>;
}

interface WorldEntry {
  readonly id: string;
  readonly terms: string;
}

export function createStarSearch({
  stars,
  starsById,
  systemsById,
}: {
  readonly stars: readonly Star[];
  readonly starsById: ReadonlyMap<string, Star>;
  readonly systemsById: ReadonlyMap<string, StarSystem>;
}): StarSearch {
  const index = new MiniSearch<Star>({
    fields: ['terms'],
    tokenize: (text) => text.split(' '),
    processTerm: (term) => term,
    extractField: (star, field) => {
      if (field === 'id') return star.id;
      const systemName = systemsById.get(star.systemId)?.name;
      const names = [star.displayName, ...catalogueNames(star.names), systemName ?? ''];
      return [...new Set(names.flatMap(aliasTerms))].join(' ');
    },
  });
  index.addAll([...stars]);
  return { index, starsById };
}

/**
 * The search with custom names and tag labels added. They change as the author types, so they get
 * a small index of their own that is cheap to rebuild, leaving the catalogue's untouched.
 */
export function withWorldNames(
  search: StarSearch,
  starMeta: Readonly<Record<string, StarMeta>>,
  tags: readonly Tag[],
): StarSearch {
  const labels = new Map(tags.map((tag) => [tag.id, tag.label]));
  const worldIndex = new MiniSearch<WorldEntry>({
    fields: ['terms'],
    tokenize: (text) => text.split(' '),
    processTerm: (term) => term,
  });
  worldIndex.addAll(
    Object.entries(starMeta).map(([id, { customName, tagIds }]) => {
      const names = [customName ?? '', ...tagIds.map((tagId) => labels.get(tagId) ?? '')];
      return { id, terms: [...new Set(names.flatMap(aliasTerms))].join(' ') };
    }),
  );
  return { ...search, worldIndex };
}

// A term with a digit in it is never fuzzy: `GJ 698` is not `GJ 699`.
const fuzziness = (term: string) => (/\d/.test(term) ? false : FUZZINESS);

// Tried in turn, because a rare near-miss can otherwise outscore an exact match on a common term.
const MATCH_TIERS: readonly SearchOptions[] = [
  {},
  { prefix: true },
  { prefix: true, fuzzy: fuzziness },
];

const byPrimaryThenNearest = (a: Star, b: Star) =>
  Number(b.isPrimary) - Number(a.isPrimary) || a.distLy - b.distLy;

/**
 * Exact matches, then prefix, then fuzzy; within each, the author's own names first, then primaries
 * and the nearest.
 */
export function searchStars(search: StarSearch, query: string): readonly Star[] {
  const terms = normaliseWords(query).join(' ');
  if (terms === '') return [];
  const found = new Set<Star>();
  for (const tier of MATCH_TIERS) {
    for (const index of [search.worldIndex, search.index]) {
      const stars = (index?.search(terms, { ...tier, combineWith: 'AND' }) ?? [])
        .flatMap((result) => search.starsById.get(result.id as string) ?? [])
        .sort(byPrimaryThenNearest);
      for (const star of stars) found.add(star);
    }
    if (found.size >= RESULT_LIMIT) break;
  }
  return [...found].slice(0, RESULT_LIMIT);
}
