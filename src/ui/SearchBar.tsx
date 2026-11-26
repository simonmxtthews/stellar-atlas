import { flushSync } from 'react-dom';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { PlanetTrait } from '../lib/exoplanets';
import { distanceFromReference, revealFilters } from '../lib/filters';
import { isTypingTarget } from '../lib/keys';
import { createStarSearch, searchStars, withWorldNames, type StarSearch } from '../lib/search';
import { formatValue, spectralCode } from '../lib/starFacts';
import { customNameOf, withCustomName } from '../lib/worldView';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import type { Star } from '../types/catalogue';

const INDEX_IDLE_TIMEOUT_MS = 1000;

// Safari has no requestIdleCallback. Returns a cancel function.
function whenIdle(work: () => void): () => void {
  if (typeof window.requestIdleCallback !== 'function') {
    const timer = window.setTimeout(work);
    return () => window.clearTimeout(timer);
  }
  const handle = window.requestIdleCallback(work, { timeout: INDEX_IDLE_TIMEOUT_MS });
  return () => window.cancelIdleCallback(handle);
}

export function SearchBar({
  catalogue,
  traitsBySystem,
}: {
  readonly catalogue: Catalogue;
  readonly traitsBySystem: ReadonlyMap<string, ReadonlySet<PlanetTrait>>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const activeOption = useRef<HTMLLIElement>(null);
  const listId = useId();
  const [search, setSearch] = useState<StarSearch | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const starMeta = useWorld((state) => state.world.starMeta);
  const tags = useWorld((state) => state.world.tags);
  const referenceStarId = useUi((state) => state.referenceStarId);
  const reference = catalogue.starsById.get(referenceStarId);

  useEffect(() => whenIdle(() => setSearch(createStarSearch(catalogue))), [catalogue]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      // A hidden interface comes back first, as nothing hidden can take focus.
      flushSync(() => useUi.getState().setChromeHidden(false));
      input.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const results = useMemo(
    () => (search ? searchStars(withWorldNames(search, starMeta, tags), query) : []),
    [query, search, starMeta, tags],
  );
  const open = focused && search !== null && query.trim() !== '';

  useEffect(() => {
    activeOption.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const finish = () => {
    setQuery('');
    setActive(0);
    input.current?.blur();
  };

  const choose = (star: Star) => {
    const { filters, setFilters, select, flyToStar } = useUi.getState();
    const system = catalogue.systemsById.get(star.systemId);
    const tagged = (starMeta[star.id]?.tagIds.length ?? 0) > 0;
    if (system) {
      const traits = traitsBySystem.get(system.id);
      setFilters(revealFilters(star, system, traits, filters, tagged, reference));
    }
    select(star.systemId, star.id);
    flyToStar(star.id);
    finish();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Typing must not reach the map's window shortcuts: H flies home, Esc closes the modal.
    event.stopPropagation();
    if (event.key === 'Escape') {
      finish();
    } else if (event.key === 'Enter') {
      const star = results[active];
      if (open && star) choose(star);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length > 0) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + results.length) % results.length);
    }
  };

  return (
    <div className="absolute top-3 left-3 z-5 w-64 lg:w-68 text-sm text-ink max-md:right-[calc(var(--corner-w)+1.25rem)] max-md:w-auto">
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search stars"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search stars"
        aria-keyshortcuts="/"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className="peer w-full rounded-xl border border-line shadow-panel bg-panel py-2 pr-9 pl-9 backdrop-blur outline-none placeholder:text-faint focus:border-accent max-md:text-base"
      />
      {/* Decoration over the input, so clicks go through to it. The key cap goes once it's in use. */}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-[0.6875rem] left-3 size-4 text-faint max-md:top-[0.8125rem]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" />
      </svg>
      <kbd
        aria-hidden
        className="pointer-events-none absolute top-[0.6875rem] right-3 border-line text-faint peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden max-md:hidden"
      >
        /
      </kbd>
      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        hidden={!open}
        className="mt-1 max-h-[60dvh] w-80 overflow-y-auto rounded-xl border border-line shadow-panel bg-panel py-1 backdrop-blur max-md:w-full"
      >
        {results.map((star, i) => (
          <li
            key={star.id}
            id={`${listId}-${i}`}
            ref={i === active ? activeOption : undefined}
            role="option"
            aria-selected={i === active}
            // Keep focus in the input until the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(star)}
            className={`flex cursor-pointer justify-between gap-3 px-3 py-1 ${
              i === active ? 'bg-raised' : ''
            }`}
          >
            <span className="truncate">
              {withCustomName(star.displayName, customNameOf(starMeta, star.id))}
            </span>
            <span className="whitespace-nowrap text-muted tabular-nums">
              {spectralCode(star.spectral)} ·{' '}
              {formatValue(distanceFromReference(star, reference), 2, 'ly')}
            </span>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-1 text-muted">No matches</li>}
      </ul>
    </div>
  );
}
