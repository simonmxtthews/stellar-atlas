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
      className="grid size-5 shrink-0 place-items-center rounded-md text-ink-soft transition-colors hover:bg-raised aria-disabled:cursor-default aria-disabled:text-faint/50 aria-disabled:hover:bg-transparent max-md:size-7"
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8a5 5 0 1 0 1.6-3.7L3 5.8" />
        <path d="M3 2.5v3.3h3.3" />
      </svg>
    </button>
  );
}
