// MOD-App — CMP-Notice "info" with COPY-notice.slow_device (CMP-Notice board "info · slow device"):
// a floating card at the bottom centre of the preview area (narrow: full width with side margins),
// muted info icon, normal text, a quiet Close. A polite live region; it hides after 8 s unless hovered
// or focused (./hide-timer.ts). Shown once per session (RULE-22). When it closes with focus inside it,
// focus moves to the empty state's Add media, else to the preview area, never to the page body.
// The full notice stack (at most 2, COPY-notice.more) comes with F-001; this is its info recipe.
// Implements: F-023.R1 (AC6, AC7), RULE-22.
import './styles/device.css';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../copy';
import { dismissSlow, slowNotice } from './device';
import { HideTimer, INFO_HIDE_MS } from './hide-timer';
import { Icon } from './icons';

/** Where focus goes when the notice closes under it. */
function focusAfter(card: HTMLElement | null): void {
  if (!card || !card.contains(document.activeElement)) return;
  const area = card.closest<HTMLElement>('.tk-preview-area');
  const add = area?.querySelector<HTMLElement>('[data-action="add-media"]');
  (add ?? area)?.focus();
}

export function SlowNotice() {
  const open = slowNotice.value;
  const card = useRef<HTMLElement | null>(null);
  const timer = useRef<HideTimer | null>(null);
  const close = () => {
    focusAfter(card.current);
    dismissSlow();
  };
  timer.current ??= new HideTimer(INFO_HIDE_MS, close);
  useEffect(() => {
    const t0 = timer.current!;
    if (open) t0.start();
    return () => t0.stop();
  }, [open]);

  return (
    <div class="tk-notice-stack" role="status" aria-live="polite">
      {open ? (
        <section
          ref={card}
          class="tk-notice tk-notice--info"
          data-notice="slow_device"
          onMouseEnter={() => timer.current?.hover(true)}
          onMouseLeave={() => timer.current?.hover(false)}
          onFocusIn={() => timer.current?.focus(true)}
          onFocusOut={(e) => {
            if (!card.current?.contains(e.relatedTarget as Node | null)) timer.current?.focus(false);
          }}
        >
          <Icon name="info" size={16} class="tk-notice__icon" />
          <p class="tk-notice__text">{t('notice.slow_device')}</p>
          <button type="button" class="tk-notice__close" aria-label={t('action.close')} onClick={close}>
            <Icon name="close" size={16} />
          </button>
        </section>
      ) : null}
    </div>
  );
}
