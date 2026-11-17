// MOD-App — CMP-Timeline's cross-fade popover (specs/30-experience/components/CMP-Timeline.md "cross-fade";
// board CMP-Timeline "cross-fade"): activating a join's bow-tie marker opens a small dialog titled
// COPY-crossfade.length with Shorter (COPY-crossfade.shorter), the length in seconds (mono), Longer
// (COPY-crossfade.longer) and Remove (COPY-action.remove_crossfade). It sits under the marker (above it when
// there is no room below), inside the window, and follows the window's size. Esc (with focus in it or on its
// marker) closes it and returns focus to what opened it (the marker, or the phone sheet's Cross-fade tile); a
// press outside, or focus moving elsewhere, closes it; it closes by itself when its cross-fade is gone.
// Implements: F-009.R2 (set its duration, remove it), F-009.R5 (0.1 s steps within RULE-10), F-009.R6
// (COPY-notice.length_full when a change would pass RULE-03), CMP-Timeline "Behavior" (the popover changes
// its length within RULE-10 and removes it) and "Accessibility" (the marker exposes an expanded state).
import { useEffect, useLayoutEffect, useReducer, useRef } from 'preact/hooks';
import { t } from '../copy';
import { openJoin, openJoinState, popoverOpener, removeCrossFade, secondsLabel, stepCrossFade } from './fades';
import { Icon } from './icons';

const TITLE_ID = 'tk-xfade-pop-title';

/** The marker of join `id` in the timeline (MOD-Timeline's view draws it). */
const markerOf = (id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`.tk-join[data-join-id="${CSS.escape(id)}"]`);

/** The control focus returns to: what opened the popover while it is still there and available, else the marker. */
function returnTarget(id: string): HTMLElement | null {
  const from = popoverOpener.el;
  if (from?.isConnected && from.getAttribute('aria-disabled') !== 'true' && from.offsetParent !== null) return from;
  return markerOf(id);
}

/** Closes the popover; `returnFocus`: focus goes back to what opened it (Esc, Remove, its cross-fade going). */
export function closeCrossFade(returnFocus: boolean): void {
  const id = openJoin.peek();
  const target = returnFocus && id !== null ? returnTarget(id) : null;
  openJoin.value = null;
  popoverOpener.el = null;
  target?.focus();
}

export function CrossFadePopover() {
  const join = openJoinState.value;
  const id = openJoin.value;
  const root = useRef<HTMLElement>(null);
  const [, relayout] = useReducer((n: number) => n + 1, 0);
  // Whether focus was inside, noted while rendering (before the popover goes from the DOM).
  const hadFocus = useRef(false);
  hadFocus.current = root.current?.contains(document.activeElement) ?? false;

  // The join's cross-fade is gone (removed, undone, its clips moved apart): close; focus that was inside goes
  // back to the join's control (now the add chip).
  useEffect(() => {
    if (id !== null && join === null) closeCrossFade(hadFocus.current);
  }, [id, join]);

  // Under the marker, centred and kept inside the window; above it when there is no room below.
  useLayoutEffect(() => {
    const pop = root.current;
    const marker = join ? markerOf(join.id) : null;
    if (!pop || !marker) return;
    const m = marker.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const gap = 4;
    const left = Math.min(Math.max(gap, m.left + m.width / 2 - w / 2), innerWidth - w - gap);
    const below = m.bottom + gap;
    const top = below + h <= innerHeight - gap ? below : Math.max(gap, m.top - gap - h);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  });

  // Opening focuses the first available control; Esc and a press outside close it.
  const opened = join?.id ?? null;
  // A layout effect: focus moves in as the popover appears (an Esc right after opening is already its own).
  useLayoutEffect(() => {
    if (opened === null) return undefined;
    // The opener is the phone tile when it opened it (`popoverOpener`), else the marker (returnTarget).
    const first = root.current?.querySelector<HTMLElement>('button:not([aria-disabled="true"])');
    first?.focus();
    const ours = (el: EventTarget | null): boolean =>
      el instanceof Node &&
      (root.current?.contains(el) === true ||
        (el instanceof Element && el.closest(`.tk-join[data-join-id="${CSS.escape(opened)}"]`) !== null));
    // Esc is the popover's only while focus is in it, on its marker, or nowhere (WebKit leaves focus on the
    // page after a click on a button); other overlays with focus keep theirs.
    const onKey = (e: KeyboardEvent): void => {
      const at = document.activeElement;
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (at && at !== document.body && !ours(at)) return;
      if (document.querySelector('dialog[open]')) return; // the notices view takes its own Esc
      e.preventDefault();
      e.stopPropagation();
      closeCrossFade(true);
    };
    // Focus moving to another control closes it (no focus change of ours).
    const onFocus = (e: FocusEvent): void => {
      if (!ours(e.target) && e.target !== popoverOpener.el) closeCrossFade(false);
    };
    const onPointer = (e: PointerEvent): void => {
      const target = e.target as Element | null;
      if (!target || root.current?.contains(target)) return;
      // The marker toggles the popover itself.
      if (target.closest?.(`.tk-join[data-join-id="${CSS.escape(opened)}"]`)) return;
      closeCrossFade(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('focusin', onFocus);
    addEventListener('resize', relayout);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('focusin', onFocus);
      removeEventListener('resize', relayout);
    };
  }, [opened]);

  if (!join) return null;
  const button = (
    action: 'shorter' | 'longer',
    label: 'crossfade.shorter' | 'crossfade.longer',
    available: boolean,
    by: 1 | -1,
  ) => (
    <button
      type="button"
      class="tk-button tk-xfade-pop__step"
      aria-label={t(label)}
      title={t(label)}
      aria-disabled={available ? undefined : 'true'}
      data-action={`crossfade-${action}`}
      onClick={() => available && stepCrossFade(join.id, by)}
    >
      <Icon name={action} size={16} />
    </button>
  );
  return (
    <section ref={root} class="tk-xfade-pop" role="dialog" aria-labelledby={TITLE_ID} data-join={join.id}>
      <h2 class="tk-xfade-pop__title" id={TITLE_ID}>
        {t('crossfade.length')}
      </h2>
      <div class="tk-xfade-pop__row">
        {button('shorter', 'crossfade.shorter', join.canShorten, -1)}
        <output class="tk-xfade-pop__value" aria-live="polite" data-control="crossfade-length">
          {secondsLabel(join.tenths)}
        </output>
        {button('longer', 'crossfade.longer', join.canLengthen, 1)}
        <button
          type="button"
          class="tk-button tk-xfade-pop__remove"
          aria-label={t('action.remove_crossfade')}
          title={t('action.remove_crossfade')}
          data-action="crossfade-remove"
          // Removed: the popover closes and focus goes to the join's control (now the add chip), also where a
          // click does not focus the button (WebKit).
          onClick={() => removeCrossFade(join.id) && closeCrossFade(true)}
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
    </section>
  );
}
