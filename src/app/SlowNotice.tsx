// MOD-App — CMP-Notice "info" with COPY-notice.slow_device (CMP-Notice board "info · slow device"):
// a floating card at the bottom centre of the preview area (narrow: full width with side margins),
// muted info icon, normal text, a quiet Close. A polite live region; it hides after a few seconds
// unless hovered or focused (CMP-Notice "Behavior", WCAG 2.2.1). Shown once per session (RULE-22).
// The full notice stack (at most 2, COPY-notice.more) comes with F-001; this is its info recipe.
// Implements: F-023.R1 (AC6, AC7), RULE-22.
import './styles/device.css';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../copy';
import { dismissSlow, slowNotice } from './device';
import { Icon } from './icons';

/** "Info and warning hide after a few seconds" (CMP-Notice): 8 s, paused while hovered or focused. */
export const INFO_HIDE_MS = 8000;

export function SlowNotice() {
  const open = slowNotice.value;
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const arm = () => {
    clear();
    if (!held.current) timer.current = setTimeout(dismissSlow, INFO_HIDE_MS);
  };
  const hold = (on: boolean) => {
    held.current = on;
    if (on) clear();
    else arm();
  };
  useEffect(() => {
    if (open) arm();
    return clear;
  }, [open]);

  return (
    <div class="tk-notices" role="status" aria-live="polite">
      {open ? (
        <section
          class="tk-notice tk-notice--info"
          data-notice="slow_device"
          onMouseEnter={() => hold(true)}
          onMouseLeave={() => hold(false)}
          onFocusIn={() => hold(true)}
          onFocusOut={() => hold(false)}
        >
          <Icon name="info" size={16} class="tk-notice__icon" />
          <p class="tk-notice__text">{t('notice.slow_device')}</p>
          <button type="button" class="tk-notice__close" aria-label={t('action.close')} onClick={dismissSlow}>
            <Icon name="close" size={16} />
          </button>
        </section>
      ) : null}
    </div>
  );
}
