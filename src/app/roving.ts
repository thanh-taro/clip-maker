// MOD-App — roving focus in a toolbar (WAI-ARIA toolbar pattern): the toolbar is one stop in the Tab order
// (the last button used, else the first available one), and Left and Right move between its buttons, wrapping.
// Buttons that are unavailable but focusable (aria-disabled) are stops too; disabled or hidden ones are skipped.
// The buttons are rendered by several components and change with the layout (narrow, compact, wide), so the
// stop is kept on the DOM: on focus, on any added, removed or disabled button, and on a resize.
// Implements: CMP-Toolbar "Accessibility" (arrow keys move between its buttons), CMP-Timeline "Accessibility"
// (its action row is a toolbar), F-017.R5 (the toolbar keeps Left and Right; MOD-Keys `scopeOf`), NFR-06;
// build question 102.

const CANDIDATES = 'button, a[href]';

/** The toolbar's own buttons: not those of a menu or popover inside it. */
function own(bar: HTMLElement): HTMLElement[] {
  return [...bar.querySelectorAll<HTMLElement>(CANDIDATES)].filter(
    (el) => el.closest('[role="toolbar"]') === bar && el.closest('[role="menu"], [role="dialog"], dialog') === null,
  );
}

/** The buttons a user can move to: shown and not disabled. */
function stops(bar: HTMLElement): HTMLElement[] {
  return own(bar).filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
}

/** Makes `bar` (role="toolbar") one Tab stop with arrow-key movement. Returns the unbind function. */
export function bindRovingToolbar(bar: HTMLElement): () => void {
  let current: HTMLElement | null = null;
  const sync = (): void => {
    const list = stops(bar);
    if (!current || !list.includes(current)) current = list[0] ?? null;
    for (const el of own(bar)) {
      const index = el === current ? 0 : -1;
      if (el.tabIndex !== index) el.tabIndex = index;
    }
  };
  const onFocus = (e: FocusEvent): void => {
    const el = e.target as HTMLElement;
    if (!own(bar).includes(el)) return;
    current = el;
    sync();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const list = stops(bar);
    const at = list.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    const n = list.length;
    const rtl = getComputedStyle(bar).direction === 'rtl';
    const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
    list[(at + step + n) % n]?.focus();
  };
  // Buttons come and go (Done while a text is edited, Music's popover) and become disabled (Export).
  const changes = new MutationObserver(sync);
  changes.observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
  // A layout change (narrow ↔ wide) hides and shows buttons: the stop must stay on a shown one.
  const sizes = new ResizeObserver(sync);
  sizes.observe(bar);
  bar.addEventListener('focusin', onFocus);
  bar.addEventListener('keydown', onKey);
  sync();
  return () => {
    changes.disconnect();
    sizes.disconnect();
    bar.removeEventListener('focusin', onFocus);
    bar.removeEventListener('keydown', onKey);
    for (const el of own(bar)) el.removeAttribute('tabindex');
  };
}
