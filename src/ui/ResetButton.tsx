import type { ReactNode } from 'react';

// Takes its setting back to the default. Inactive, not hidden, at the default, so rows don't shift.
// aria-disabled rather than disabled: the click that resets leaves focus here, and a browser sends
// no key events to a disabled element, which would silence every keyboard shortcut.
export function ResetButton({
  name,
  to,
  isDefault,
  onReset,
}: {
  readonly name: string;
  readonly to: string;
  readonly isDefault: boolean;
  readonly onReset: () => void;
}) {
  const label = `Reset ${name} to ${to}`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={isDefault}
      onClick={() => {
        if (!isDefault) onReset();
      }}
      // Its own type settings, as it usually sits in an uppercase, letter-spaced heading.
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-line-strong bg-raised px-1.5 text-[0.6875rem] leading-none font-medium tracking-normal text-ink-soft normal-case shadow-sm transition-colors hover:border-accent/50 hover:bg-accent/15 hover:text-accent-soft aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:border-line-strong aria-disabled:hover:bg-raised aria-disabled:hover:text-ink-soft max-md:h-7 max-md:px-2 max-md:text-xs"
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8a5 5 0 1 0 1.6-3.7L3 5.8" />
        <path d="M3 2.5v3.3h3.3" />
      </svg>
      Reset
    </button>
  );
}

// The line above a setting: its name on the left; its value, if it shows one, and its reset button
// on the right. "section" is the small uppercase heading; "field" the quieter form label.
export function FieldHeading({
  label,
  reset,
  value,
  htmlFor,
  variant = 'section',
  className = '',
}: {
  readonly label: ReactNode;
  readonly reset?: ReactNode;
  readonly value?: ReactNode;
  readonly htmlFor?: string;
  readonly variant?: 'section' | 'field';
  readonly className?: string;
}) {
  const type = variant === 'section' ? 'section-label' : 'text-xs text-muted';
  return (
    <div className={`flex min-h-5 items-center gap-2 ${type} ${className}`}>
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      <span className="ml-auto flex items-center gap-2">
        {value !== undefined && (
          <span className="tracking-normal tabular-nums normal-case">{value}</span>
        )}
        {reset}
      </span>
    </div>
  );
}
