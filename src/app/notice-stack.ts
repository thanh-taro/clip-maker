// MOD-App — the CMP-Notice stack (specs/30-experience/components/CMP-Notice.md "Behavior"; style.md
// "Notices"): one placement for every notice, at most 2 shown (newest at the bottom), a newer notice
// replacing an older one of the same kind, an error never replaced by info, the rest folded into a
// COPY-notice.more chip that shows them when activated. Success hides after 4 s, info and warning after
// INFO_HIDE_MS (build-spec-questions 61), errors and progress stay until dismissed or finished.
// Texts are thunks calling `t()` while rendering, so a language switch re-renders them (F-022.R2).
import { signal } from '@preact/signals';
import { INFO_HIDE_MS } from './hide-timer';

export type NoticeKind = 'success' | 'info' | 'warning' | 'error' | 'progress';

export interface NoticeEntry {
  readonly key: number;
  readonly kind: NoticeKind;
  /** `data-notice`: the COPY string's short name (added, refused_list, slow_device…). */
  readonly tag: string;
  /** The message, or an error's title. */
  readonly text: () => string;
  /** An error's list ("name: reason"; CMP-Notice error). */
  readonly items?: readonly { readonly name: string; readonly text: () => string }[];
  /** Called when the notice closes (by Close, its timer, Cancel or being replaced). */
  readonly onClose?: () => void;
}

export const MAX_SHOWN = 2;
/** CMP-Notice: success notices hide after 4 seconds. */
export const SUCCESS_HIDE_MS = 4000;

/** Implements: CMP-Notice "Behavior" timers. Null: stays until dismissed or finished. */
export function hideAfter(kind: NoticeKind): number | null {
  if (kind === 'success') return SUCCESS_HIDE_MS;
  if (kind === 'info' || kind === 'warning') return INFO_HIDE_MS;
  return null;
}

/**
 * Implements: CMP-Notice — a newer notice replaces an older one of the same kind (so an error is only
 * ever replaced by a newer error, never by info) and goes to the bottom of the stack.
 */
export function pushNotice(list: readonly NoticeEntry[], entry: NoticeEntry): NoticeEntry[] {
  return [...list.filter((n) => n.kind !== entry.kind), entry];
}

/** Implements: CMP-Notice "stack" — the newest 2 show; the rest fold into COPY-notice.more. */
export function stackView(
  list: readonly NoticeEntry[],
  expanded: boolean,
): { shown: readonly NoticeEntry[]; more: number } {
  if (expanded || list.length <= MAX_SHOWN) return { shown: list, more: 0 };
  return { shown: list.slice(-MAX_SHOWN), more: list.length - MAX_SHOWN };
}

// ── The session's stack ──────────────────────────────────────────────────────────────────────────

export const notices = signal<readonly NoticeEntry[]>([]);
/** The COPY-notice.more chip was activated: every notice shows. */
export const noticesExpanded = signal(false);
let nextKey = 0;

export function showNotice(n: Omit<NoticeEntry, 'key'>): number {
  const entry: NoticeEntry = { ...n, key: ++nextKey };
  const replaced = notices.value.filter((x) => x.kind === entry.kind);
  notices.value = pushNotice(notices.value, entry);
  for (const r of replaced) r.onClose?.();
  return entry.key;
}

export function closeNotice(key: number): void {
  const gone = notices.value.find((n) => n.key === key);
  if (!gone) return;
  notices.value = notices.value.filter((n) => n.key !== key);
  if (notices.value.length <= MAX_SHOWN) noticesExpanded.value = false;
  gone.onClose?.();
}

/** Closes the notice with this tag, if one shows (e.g. progress when the batch finishes). */
export function closeTagged(tag: string): void {
  for (const n of notices.value.filter((x) => x.tag === tag)) closeNotice(n.key);
}

/** Test reset (one page = one session in the app). */
export function resetNotices(): void {
  notices.value = [];
  noticesExpanded.value = false;
}
