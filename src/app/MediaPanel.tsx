// MOD-App — CMP-MediaPanel (specs/30-experience/components/CMP-MediaPanel.md; board CMP-MediaPanel):
// the session's sources, each with a thumbnail and kind icon, name, kind and duration (m:ss), Add to
// timeline and Delete; below them the file being checked (COPY-media.checking, COPY-media.queue, a bar
// and Cancel) and the refused group (COPY-media.refused) until dismissed or the panel closes. Wide: a
// left drawer, a complementary region. Narrow (< 700 px): a bottom sheet over the timeline, a dialog.
// Implements: F-001.R4 (AC1, AC6, AC14), F-001.R6 (Cancel), RULE-21 touch rows.
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { RULE_05, type Source } from '../core';
import { formatDuration, t } from '../copy';
import { registry } from '../media';
import { project } from '../project';
import {
  cancelAdding,
  closePanel,
  dismissRefused,
  panelOpen,
  panelOpener,
  pickerClosed,
  placeAgain,
  progress,
  refusedFiles,
  removeMedia,
} from './adding';
import { Icon, type IconName } from './icons';
import { pickFiles } from './MediaInput';
import { overlayOpen } from './playback';
import { editingText } from './text';
import { ProgressBar } from './NoticeStack';

/** style.md "Layouts": narrow below 700 px of the tool's own width (the frame when embedded). */
const NARROW = '(max-width: 699.98px)';
export const narrow = signal(false);

function useNarrow(): boolean {
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const update = () => (narrow.value = mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return narrow.value;
}

const KIND_COPY = { video: 'media.kind_video', photo: 'media.kind_photo', audio: 'media.kind_audio' } as const;
const KIND_ICON: Record<Source['kind'], IconName> = { video: 'film', photo: 'photo', audio: 'music' };

/** A source's length in the panel: its duration; a photo shows the duration it gets when placed (RULE-05). */
const lengthOf = (s: Source): number => s.duration ?? RULE_05.photoDefaultSeconds * 1_000_000;

/** The row thumbnail: a video's first frame or the photo, cropped to fill (cover). */
function Thumbnail({ source }: { source: Source }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    // ADR-0009 §7: pictures freed while the source was out of the project are rebuilt on demand.
    void registry.load(source.id).then((entry) => {
      const c = canvas.current;
      const img = entry?.thumbnail ?? entry?.bitmap;
      const ctx = c?.getContext('2d');
      if (!live || !c || !img || !ctx) return;
      const scale = Math.max(c.width / img.width, c.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    });
    return () => {
      live = false;
    };
  }, [source.id]);
  return (
    <span class={`tk-media__thumb tk-media__thumb--${source.kind}`}>
      {source.kind === 'audio' ? null : <canvas ref={canvas} width={96} height={96} class="tk-media__picture" />}
      <Icon name={KIND_ICON[source.kind]} size={source.kind === 'audio' ? 20 : 16} class="tk-media__kind" />
    </span>
  );
}

function SourceRow({ source }: { source: Source }) {
  const nameId = `tk-media-name-${source.id}`;
  return (
    <li class="tk-media__row" data-source={source.id}>
      <Thumbnail source={source} />
      <div class="tk-media__info">
        <span id={nameId} class="tk-media__name">
          {source.name}
        </span>
        <span class="tk-media__meta">
          {t(KIND_COPY[source.kind])} · <span class="tk-media__time">{formatDuration(lengthOf(source))}</span>
        </span>
        <div class="tk-media__actions">
          <button
            type="button"
            class="tk-button tk-button--ghost tk-media__place"
            aria-describedby={nameId}
            onClick={() => placeAgain(source.id)}
          >
            <Icon name="addMedia" size={16} />
            {t('media.place_again')}
          </button>
          <button
            type="button"
            class="tk-icon-button"
            data-action="delete"
            aria-label={t('action.delete')}
            aria-describedby={nameId}
            title={t('action.delete')}
            onClick={() => deleteSource(source.id)}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}

/** Where focus goes after the next render (Delete and Cancel remove the focused control). */
let focusNext: (() => HTMLElement | null) | null = null;

const panelEl = () => document.querySelector<HTMLElement>('.tk-media');
const headingEl = () => document.getElementById('tk-media-title');

/**
 * Implements: CMP-MediaPanel Delete (F-001.AC6) without losing focus: the next row's Delete, else the
 * previous row's, else the panel heading.
 */
function deleteSource(id: string): void {
  const ids = project.peek().sources.map((s) => s.id);
  const i = ids.indexOf(id);
  const target = ids[i + 1] ?? ids[i - 1];
  focusNext = () =>
    (target && panelEl()?.querySelector<HTMLElement>(`[data-source="${target}"] [data-action="delete"]`)) ||
    headingEl();
  removeMedia(id);
}

/** Cancel in the checking row: the row goes away, so focus moves to the panel's Add media or heading. */
function cancelFromPanel(): void {
  focusNext = () => panelEl()?.querySelector<HTMLElement>('[data-action="panel-add-media"]') ?? headingEl();
  cancelAdding();
}

function CheckingRow() {
  const p = progress.value;
  if (!p) return null;
  return (
    <div class="tk-media__row tk-media__row--checking" data-checking="">
      <span class="tk-media__thumb tk-media__thumb--loading">
        <Icon name="loader" size={16} />
      </span>
      <div class="tk-media__info">
        <span class="tk-media__name">{t('media.checking', { name: p.name })}</span>
        <span class="tk-media__meta">{t('media.queue', { n: p.position, total: p.total })}</span>
        <ProgressBar
          value={p.position / p.total}
          label={t('notice.adding_label')}
          text={t('notice.checking', { done: p.done, total: p.total })}
        />
      </div>
      <button type="button" class="tk-button tk-button--ghost" onClick={cancelFromPanel}>
        {t('action.cancel')}
      </button>
    </div>
  );
}

function RefusedGroup() {
  const list = refusedFiles.value;
  if (list.length === 0) return null;
  return (
    <section class="tk-media__refused" aria-labelledby="tk-media-refused">
      <h3 id="tk-media-refused" class="tk-media__refused-title">
        <Icon name="error" size={16} />
        {t('media.refused')}
      </h3>
      <ul class="tk-media__refused-list">
        {list.map((r, i) => (
          <li key={`${i}-${r.name}`}>
            <span class="tk-media__refused-text">
              <span class="tk-media__name">{r.name}</span>: {t(r.reason)}
            </span>
            <button
              type="button"
              class="tk-icon-button tk-icon-button--sm"
              aria-label={t('action.dismiss')}
              title={t('action.dismiss')}
              onClick={() => dismissRefused(i)}
            >
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddButton({ outlined }: { outlined: boolean }) {
  return (
    <button
      type="button"
      class={outlined ? 'tk-button tk-button--outlined-accent' : 'tk-button tk-button--ghost'}
      data-action="panel-add-media"
      onClick={pickFiles}
    >
      <Icon name="addMedia" size={16} />
      {t('action.add_media')}
    </button>
  );
}

const shown = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el !== document.body && el.isConnected && el.getClientRects().length > 0;

/**
 * Closes the panel; focus returns to the control that opened it, else the toolbar's Add media when
 * shown, else the preview area.
 */
function closeAndReturn(): void {
  const opener = panelOpener;
  closePanel();
  // The editor behind the narrow sheet must be reachable again before focus returns to it.
  liftInert?.();
  const add = document.querySelector('.tk-toolbar [data-action="add-media"]');
  const target = shown(opener) ? opener : shown(add) ? add : document.querySelector<HTMLElement>('.tk-preview-area');
  target?.focus();
}

/** Undoes the narrow sheet's `inert` on the editor behind it (set while the sheet is open). */
let liftInert: (() => void) | null = null;

const FOCUSABLE = 'button:not([disabled]), [href], input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])';

export function MediaPanel() {
  const isNarrow = useNarrow();
  const panel = useRef<HTMLElement>(null);
  const open = panelOpen.value;
  const picked = pickerClosed.value;
  // After Delete or Cancel removed the focused control.
  useLayoutEffect(() => {
    const next = focusNext;
    if (!next) return;
    focusNext = null;
    next()?.focus();
  });
  // CMP-MediaPanel "Accessibility" (QA a11y m12): the narrow sheet is modal for every input, touch exploration
  // included: the editor behind it is inert (the file picker's input and open dialogs are left alone).
  useEffect(() => {
    const sheet = panel.current;
    const editor = sheet?.parentElement;
    if (!open || !isNarrow || !sheet || !editor) return undefined;
    // The notice stack and the status region stay live: what the sheet adds is still announced (CMP-Notice
    // "placement · narrow" puts the stack just above the sheet).
    const live = (el: Element): boolean =>
      el.matches('.tk-preview-area, .tk-stage, .tk-notice-stack, .tk-preview-status');
    const keep = (el: Element): boolean =>
      el === sheet || el instanceof HTMLDialogElement || el instanceof HTMLInputElement || live(el);
    const behind: HTMLElement[] = [];
    const visit = (parent: Element): void => {
      for (const el of Array.from(parent.children)) {
        if (!(el instanceof HTMLElement) || el === sheet) continue;
        if (el.matches('.tk-preview-area, .tk-stage')) visit(el);
        else if (!keep(el)) behind.push(el);
      }
    };
    visit(editor);
    const was = behind.map((el) => el.inert);
    for (const el of behind) el.inert = true;
    const lift = (): void => {
      behind.forEach((el, i) => (el.inert = was[i] ?? false));
      if (liftInert === lift) liftInert = null;
    };
    liftInert = lift;
    return lift;
  }, [open, isNarrow]);
  // The narrow sheet is a modal dialog: focus moves into it when it opens and when the file picker
  // closes; Tab stays inside it; Esc from anywhere in it closes it and returns focus to its opener.
  useEffect(() => {
    if (!open || !isNarrow) return;
    if (!panel.current?.contains(document.activeElement)) headingEl()?.focus();
  }, [open, isNarrow, picked]);
  useEffect(() => {
    if (!open || !isNarrow) return;
    const onKey = (e: KeyboardEvent) => {
      const el = panel.current;
      if (!el || !el.contains(document.activeElement)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAndReturn();
      } else if (e.key === 'Tab') {
        // Focus is moved here rather than left to the browser, whose Tab order differs (WebKit skips
        // buttons by default), so it never leaves the sheet.
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const n = items.length;
        const next = i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n;
        items[next]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isNarrow]);
  // Implements: CMP-MediaPanel "Behavior" (build question 208) — the wide drawer isn't modal, but Esc with focus in
  // it closes it and returns focus to Add media (its opener). An open dialog, sheet, popover or menu, or the text
  // editor, keeps its own Esc: the drawer closes only when nothing else would take it.
  useEffect(() => {
    if (!open || isNarrow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      const el = panel.current;
      if (!el || !el.contains(document.activeElement)) return;
      if (overlayOpen(document) || editingText.peek() !== null) return;
      e.preventDefault();
      closeAndReturn();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isNarrow]);
  if (!open) return null;
  const sources = project.value.sources;
  const empty = sources.length === 0 && !progress.value && refusedFiles.value.length === 0;
  return (
    <aside
      ref={panel}
      class="tk-media"
      data-variant={isNarrow ? 'sheet' : 'drawer'}
      role={isNarrow ? 'dialog' : undefined}
      aria-modal={isNarrow ? 'true' : undefined}
      aria-labelledby="tk-media-title"
    >
      {isNarrow ? <span class="tk-media__grabber" /> : null}
      <header class="tk-media__head">
        <h2 id="tk-media-title" class="tk-media__title" tabIndex={-1}>
          {t('media.title')}
        </h2>
        {empty ? null : <AddButton outlined={false} />}
        <button
          type="button"
          class="tk-icon-button"
          aria-label={t('action.close')}
          title={t('action.close')}
          onClick={closeAndReturn}
        >
          <Icon name="close" size={16} />
        </button>
      </header>
      {empty ? (
        <div class="tk-media__empty">
          <p>{t('media.empty')}</p>
          <AddButton outlined />
          <p class="tk-media__hint">{t('empty.drop_hint')}</p>
        </div>
      ) : (
        <div class="tk-media__body">
          <ul class="tk-media__list">
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </ul>
          <CheckingRow />
          <RefusedGroup />
        </div>
      )}
    </aside>
  );
}
