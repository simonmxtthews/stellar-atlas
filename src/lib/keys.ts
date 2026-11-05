const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'radio', 'range']);

// Keys pressed in a text field are typing, not map shortcuts.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    Boolean(target.isContentEditable)
  );
}
