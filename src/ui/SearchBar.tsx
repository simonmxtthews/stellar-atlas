import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { revealFilters } from '../lib/filters';
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

export function SearchBar({ catalogue }: { readonly catalogue: Catalogue }) {
  const input = useRef<HTMLInputElement>(null);
  const activeOption = useRef<HTMLLIElement>(null);
  const listId = useId();
  const [search, setSearch] = useState<StarSearch | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const starMeta = useWorld((state) => state.world.starMeta);
  const tags = useWorld((state) => state.world.tags);

  useEffect(() => whenIdle(() => setSearch(createStarSearch(catalogue))), [catalogue]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
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
    if (system) setFilters(revealFilters(star, system, filters, tagged));
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
    <div className="absolute top-3 left-3 z-5 w-60 text-sm text-slate-200 max-md:right-3 max-md:w-auto">
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
        placeholder="Search stars ( / )"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-slate-700/60 bg-slate-950/85 px-3 py-2 backdrop-blur outline-none placeholder:text-slate-500 focus:border-sky-400 max-md:text-base"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        hidden={!open}
        className="mt-1 max-h-[60dvh] w-80 overflow-y-auto rounded-lg border border-slate-700/60 bg-slate-950/95 py-1 backdrop-blur max-md:w-full"
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
              i === active ? 'bg-slate-800' : ''
            }`}
          >
            <span className="truncate">
              {withCustomName(star.displayName, customNameOf(starMeta, star.id))}
            </span>
            <span className="whitespace-nowrap text-slate-400 tabular-nums">
              {spectralCode(star.spectral)} · {formatValue(star.distLy, 2, 'ly')}
            </span>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-1 text-slate-400">No matches</li>}
      </ul>
    </div>
  );
}
