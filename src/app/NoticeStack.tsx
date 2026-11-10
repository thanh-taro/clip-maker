// MOD-App — CMP-Notice (specs/30-experience/components/CMP-Notice.md; board CMP-Notice): the stack at
// the bottom centre of the preview area (narrow: full width with side margins), one recipe per kind:
// success, info, warning, error (title and a list of at most 3 "name: reason" items, then
// COPY-action.show_all) and progress (COPY-notice.adding, an accent bar, COPY-media.checking and a quiet
// Cancel). Success, info, warning and progress are polite live regions; errors are assertive.
// Timers pause while a notice is hovered or focused (./hide-timer.ts). When a notice closes with focus
// inside it, focus moves to Add media in the empty state, else to the preview area, never the body.
// COPY-notice.slow_device (F-023, RULE-22) is one info notice of this stack.
// Implements: F-001 (CMP-Notice results and progress), F-023.R1 (AC6, AC7), RULE-22.
import './styles/device.css';
import { effect } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../copy';
import { cancelAdding, progress } from './adding';
import { dismissSlow, slowNotice } from './device';
import { HideTimer } from './hide-timer';
import { Icon, type IconName } from './icons';
import {
  closeNotice,
  closeTagged,
  hideAfter,
  notices,
  noticesExpanded,
  showNotice,
  stackView,
  type NoticeEntry,
} from './notice-stack';

// RULE-22: the session's slow-device notice joins the stack while it is up.
effect(() => {
  if (slowNotice.value) {
    if (!notices.peek().some((n) => n.tag === 'slow_device'))
      showNotice({ kind: 'info', tag: 'slow_device', text: () => t('notice.slow_device'), onClose: dismissSlow });
  } else closeTagged('slow_device');
});

/** Where focus goes when a notice closes under it. */
function focusAfter(card: HTMLElement | null): void {
  if (!card || !card.contains(document.activeElement)) return;
  const area = card.closest<HTMLElement>('.tk-preview-area');
  const add = area?.querySelector<HTMLElement>('[data-action="add-media"]');
  (add ?? area)?.focus();
}

const ICONS: Record<NoticeEntry['kind'], IconName> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'error',
  progress: 'upload',
};
/** CMP-Notice "info": COPY-notice.no_sound uses a muted speaker; length_limited an accent info icon. */
const iconOf = (n: NoticeEntry): IconName => (n.tag === 'no_sound' ? 'muted' : ICONS[n.kind]);

/** Up to 3 items show; COPY-action.show_all expands the full list in place (CMP-Notice "error"). */
const LIST_PREVIEW = 3;

/** A bar whose fill is set through the CSSOM (the CSP allows no inline style attribute). */
export function ProgressBar({ value, label, text }: { value: number; label: string; text: string }) {
  const fill = useRef<HTMLSpanElement>(null);
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  useLayoutEffect(() => {
    fill.current?.style.setProperty('inline-size', `${pct}%`);
  }, [pct]);
  return (
    <span
      class="tk-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={text}
    >
      <span ref={fill} class="tk-progress__fill" />
    </span>
  );
}

function ProgressBody() {
  const p = progress.value;
  if (!p) return null;
  return (
    <div class="tk-notice__body">
      <p class="tk-notice__text">{t('notice.adding', { done: p.position, total: p.total })}</p>
      <ProgressBar
        value={p.position / p.total}
        label={t('notice.adding_label')}
        text={t('notice.checking', { done: p.done, total: p.total })}
      />
      <p class="tk-notice__detail">{t('media.checking', { name: p.name })}</p>
    </div>
  );
}

function ErrorBody({ n }: { n: NoticeEntry }) {
  const [all, setAll] = useState(false);
  const items = n.items ?? [];
  const shown = all ? items : items.slice(0, LIST_PREVIEW);
  return (
    <div class="tk-notice__body">
      <p class="tk-notice__title">{n.text()}</p>
      <ul class="tk-notice__list">
        {shown.map((item, i) => (
          <li key={i}>
            <span class="tk-notice__name">{item.name}</span>: {item.text()}
          </li>
        ))}
      </ul>
      {items.length > LIST_PREVIEW && !all ? (
        <button type="button" class="tk-notice__link" onClick={() => setAll(true)}>
          {t('action.show_all')}
        </button>
      ) : null}
    </div>
  );
}

function NoticeCard({ n, order }: { n: NoticeEntry; order: number }) {
  const card = useRef<HTMLElement | null>(null);
  const timer = useRef<HideTimer | null>(null);
  const close = () => {
    focusAfter(card.current);
    closeNotice(n.key);
  };
  const ms = hideAfter(n.kind);
  if (ms !== null) timer.current ??= new HideTimer(ms, close);
  useEffect(() => {
    const t0 = timer.current;
    t0?.start();
    return () => t0?.stop();
  }, []);
  useLayoutEffect(() => {
    card.current?.style.setProperty('order', String(order));
  }, [order]);

  return (
    <section
      ref={card}
      class={`tk-notice tk-notice--${n.kind}`}
      data-notice={n.tag}
      onMouseEnter={() => timer.current?.hover(true)}
      onMouseLeave={() => timer.current?.hover(false)}
      onFocusIn={() => timer.current?.focus(true)}
      onFocusOut={(e) => {
        if (!card.current?.contains(e.relatedTarget as Node | null)) timer.current?.focus(false);
      }}
    >
      <Icon name={iconOf(n)} size={16} class="tk-notice__icon" />
      {n.kind === 'error' ? (
        <ErrorBody n={n} />
      ) : n.kind === 'progress' ? (
        <ProgressBody />
      ) : (
        <p class="tk-notice__text">{n.text()}</p>
      )}
      {n.kind === 'progress' ? (
        <button type="button" class="tk-notice__cancel" onClick={cancelAdding}>
          {t('action.cancel')}
        </button>
      ) : (
        <button type="button" class="tk-notice__close" aria-label={t('action.close')} onClick={close}>
          <Icon name="close" size={16} />
        </button>
      )}
    </section>
  );
}

export function Notices() {
  const { shown, more } = stackView(notices.value, noticesExpanded.value);
  const order = new Map(shown.map((n, i) => [n.key, i]));
  const card = (n: NoticeEntry) => <NoticeCard key={n.key} n={n} order={order.get(n.key) ?? 0} />;
  return (
    <div class="tk-notice-stack">
      {/* Two live regions that always exist (so additions are announced); their cards share the stack's
          order, newest at the bottom. */}
      <div class="tk-notice-region" role="status" aria-live="polite">
        {shown.filter((n) => n.kind !== 'error').map(card)}
      </div>
      <div class="tk-notice-region" role="alert" aria-live="assertive">
        {shown.filter((n) => n.kind === 'error').map(card)}
      </div>
      {more > 0 ? (
        <button type="button" class="tk-notice-more" onClick={() => (noticesExpanded.value = true)}>
          {t('notice.more', { n: more })}
        </button>
      ) : null}
    </div>
  );
}
