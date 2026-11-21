import { useMemo, useState } from 'react';
import { distanceFromReference, SOL_ID } from '../lib/filters';
import {
  DEFAULT_STAR_SORT,
  nextSort,
  pageCount,
  sortStars,
  STAR_PAGE_SIZE,
  type StarSort,
  type StarSortKey,
} from '../lib/starList';
import { formatValue, spectralCode } from '../lib/starFacts';
import { customNameOf } from '../lib/worldView';
import type { Catalogue } from '../store/catalogue';
import { useUi } from '../store/ui';
import { useWorld } from '../store/world';
import { QUIET_BUTTON_CLASS } from './controlStyles';

interface Column {
  readonly key: StarSortKey;
  readonly label: string;
  readonly title: string;
  readonly className: string;
}

// A phone hasn't room for every column, so the names keep theirs.
const PHONE_HIDDEN = 'max-md:hidden';

const COLUMNS: readonly Column[] = [
  { key: 'name', label: 'Star', title: 'Name', className: 'text-left' },
  { key: 'type', label: 'Type', title: 'Spectral type', className: 'w-16 text-left' },
  { key: 'distance', label: 'Dist.', title: 'Distance', className: 'w-16 text-right' },
  {
    key: 'mag',
    label: 'Mag.',
    title: 'Apparent magnitude',
    className: `w-15 text-right ${PHONE_HIDDEN}`,
  },
  {
    key: 'planets',
    label: 'Planets',
    title: 'Confirmed planets',
    className: 'w-[4.75rem] text-right',
  },
];

function SortArrow({ direction }: { readonly direction: 'asc' | 'desc' | null }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={`size-2.5 shrink-0 ${direction ? 'text-accent' : 'text-faint opacity-0 group-hover:opacity-100'}`}
      fill="currentColor"
    >
      {direction === 'desc' ? <path d="M1.5 3.5h7L5 8z" /> : <path d="M1.5 6.5h7L5 2z" />}
    </svg>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  flipped = false,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly flipped?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`${QUIET_BUTTON_CLASS} grid size-7 place-items-center px-0`}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className={`size-3.5 ${flipped ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </svg>
    </button>
  );
}

// The stars on screen, as a sortable table down the right, opened from the count in the corner. It
// follows the camera and filters live. A row opens that star's details, which take this panel's
// place until they're closed.
export function StarList({ catalogue }: { readonly catalogue: Catalogue }) {
  const open = useUi((state) => state.starListOpen);
  const setOpen = useUi((state) => state.setStarListOpen);
  const indices = useUi((state) => state.framedStarIndices);
  const detailOpen = useUi((state) => state.detail !== null);
  const chromeHidden = useUi((state) => state.chromeHidden);
  const select = useUi((state) => state.select);
  const referenceStarId = useUi((state) => state.referenceStarId);
  const starMeta = useWorld((state) => state.world.starMeta);
  const [sort, setSort] = useState<StarSort>(DEFAULT_STAR_SORT);
  const [page, setPage] = useState(0);

  const reference = catalogue.starsById.get(referenceStarId);
  const sorted = useMemo(
    () =>
      sortStars(
        indices.flatMap((index) => catalogue.stars[index] ?? []),
        sort,
        reference,
      ),
    [catalogue, indices, reference, sort],
  );
  if (!open) return null;

  const pages = pageCount(sorted.length);
  const current = Math.min(page, pages - 1); // the list can shrink under the page being read
  const first = current * STAR_PAGE_SIZE;
  const rows = sorted.slice(first, first + STAR_PAGE_SIZE);
  const fromName = reference && reference.id !== SOL_ID ? reference.displayName : 'Sol';

  return (
    <aside
      aria-label="Stars in view"
      hidden={chromeHidden || detailOpen}
      // Where the star details open, so the two take turns.
      className="fixed top-[3.875rem] right-3 bottom-3 z-10 flex w-[26rem] flex-col overflow-hidden rounded-xl border border-line bg-panel text-sm text-ink shadow-panel backdrop-blur max-[68rem]:top-[5.9375rem] max-md:inset-x-0 max-md:top-[4.125rem] max-md:bottom-0 max-md:w-auto max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-medium">Stars in view</h2>
          <p data-testid="star-list-summary" className="text-xs text-muted">
            {sorted.length.toLocaleString('en')} on screen · distances in ly from {fromName}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="rounded px-2 py-0.5 text-muted hover:bg-raised"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-muted">
            No stars on screen. Turn the view or widen the filters.
          </p>
        ) : (
          <table className="w-full table-fixed text-xs">
            <thead className="sticky top-0 z-1 bg-field/95 backdrop-blur">
              <tr>
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                      className={`${column.className} p-0 font-normal first:pl-2 last:pr-2`}
                    >
                      <button
                        type="button"
                        title={`Sort by ${column.title.toLowerCase()}`}
                        onClick={() => {
                          setSort(nextSort(sort, column.key));
                          setPage(0);
                        }}
                        className={`group inline-flex w-full items-center gap-1 px-2 py-2 section-label transition-colors hover:text-ink ${
                          column.className.includes('text-right') ? 'flex-row-reverse' : ''
                        } ${active ? 'text-ink-soft' : ''}`}
                      >
                        {column.label}
                        <SortArrow direction={active ? sort.direction : null} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((star) => {
                const planets = star.planetIds.length;
                const customName = customNameOf(starMeta, star.id);
                return (
                  <tr
                    key={star.id}
                    data-testid="star-list-row"
                    onClick={() => select(star.systemId, star.id)}
                    className="cursor-pointer border-t border-hairline transition-colors hover:bg-raised"
                  >
                    <th scope="row" className="py-1.5 pr-2 pl-4 text-left font-normal">
                      {/* The row's one control, for the keyboard; the whole row takes a click. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          select(star.systemId, star.id);
                        }}
                        className="flex w-full min-w-0 items-center gap-2 text-left"
                      >
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: star.colorHex }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">
                            {star.displayName}
                          </span>
                          {customName && (
                            <span className="block truncate text-accent-soft">{customName}</span>
                          )}
                        </span>
                      </button>
                    </th>
                    <td className="truncate px-2 text-ink-soft" title={spectralCode(star.spectral)}>
                      {star.spectral.cls === 'unknown' ? '—' : spectralCode(star.spectral)}
                    </td>
                    <td className="px-2 text-right text-ink-soft">
                      {formatValue(distanceFromReference(star, reference), 2)}
                    </td>
                    <td className={`px-2 text-right text-ink-soft ${PHONE_HIDDEN}`}>
                      {formatValue(star.mag, 2)}
                    </td>
                    <td
                      className={`pr-4 pl-2 text-right ${planets > 0 ? 'text-accent-soft' : 'text-faint'}`}
                    >
                      {planets}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <nav
          aria-label="Pages"
          className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-3 py-2 text-xs text-muted"
        >
          <span data-testid="star-list-range" className="tabular-nums">
            {(first + 1).toLocaleString('en')}–{(first + rows.length).toLocaleString('en')} of{' '}
            {sorted.length.toLocaleString('en')}
          </span>
          <div className="flex items-center gap-1">
            <PageButton
              label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            />
            <span className="min-w-14 text-center tabular-nums">
              Page {current + 1} of {pages}
            </span>
            <PageButton
              label="Next page"
              flipped
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            />
          </div>
        </nav>
      )}
    </aside>
  );
}
