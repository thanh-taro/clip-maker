// MOD-App — CMP-ExportProgress (specs/30-experience/components/CMP-ExportProgress.md; boards CMP-ExportProgress,
// SCR-Editor "exporting" and "export-error", wide and narrow). A native modal dialog over a scrim: the editor
// behind it is inert while it is open (SCR-Editor "exporting": the editor is locked), it can't be dismissed by
// clicking outside, and Esc acts as Cancel while running. States: running, cancelling, done (with Share where
// the device and the frame allow it, F-015.R9), failed, interrupted and no space. Narrow layouts show it as a
// bottom sheet (export.css).
// Implements: F-015.R3/R5/R6/R9, F-015.AC3/AC6/AC12/AC15, F-022.R2 (only the texts follow a language switch),
// CMP-ExportProgress "Variants & states", "Behavior" and "Accessibility", SCR-Editor "exporting" and
// "export-error".
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatDuration, formatNumber, language, t } from '../copy';
import {
  cancelExport,
  changeSettings,
  closeRun,
  failedTextId,
  focusOpener,
  panelOpen,
  run,
  shareExport,
  tryAgain,
  type ExportKind,
  type RunView,
} from './export';
import { Icon, type IconName } from './icons';

const TITLE_ID = 'tk-run-title';
const TEXT_ID = 'tk-run-text';
/** CMP-ExportProgress "Accessibility": the live progress line is updated at most this often. */
export const ANNOUNCE_MS = 5000;

/** Splits a COPY text around the values marked with private-use markers, so the values can be styled. */
export function marked(text: string, values: readonly string[]): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /(\d)/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(
      <span class="tk-run__mono" key={m.index}>
        {values[Number(m[1])]}
      </span>,
    );
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
const mark = (i: number): string => `${i}`;

/** COPY-export.progress (or COPY-export.progress_starting before the first time estimate), as plain text. */
export function progressText(fraction: number, remainingMs: number | null): { text: string; values: string[] } {
  const percent = formatNumber(Math.floor(fraction * 100));
  if (remainingMs === null) return { text: t('export.progress_starting', { percent: mark(0) }), values: [percent] };
  const remaining = formatDuration(Math.max(0, remainingMs) * 1000 + 999_999);
  return { text: t('export.progress', { percent: mark(0), remaining: mark(1) }), values: [percent, remaining] };
}

const plain = (p: { text: string; values: string[] }): string =>
  p.text.replace(/(\d)/g, (_, i: string) => p.values[Number(i)] ?? '');

/** The polite announcement, refreshed at most every ANNOUNCE_MS (so screen readers aren't flooded). */
function useThrottled(text: string): string {
  const [said, setSaid] = useState(text);
  const last = useRef(0);
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    const wait = last.current + ANNOUNCE_MS - Date.now();
    if (wait <= 0) {
      last.current = Date.now();
      setSaid(text);
      return undefined;
    }
    const timer = setTimeout(() => {
      last.current = Date.now();
      setSaid(latest.current);
    }, wait);
    return () => clearTimeout(timer);
  }, [text]);
  return said;
}

const ERRORS = {
  failed: {
    title: 'export.failed_title',
    text: 'error.export_failed',
    icon: 'failed',
    action: 'action.change_settings',
  },
  interrupted: {
    title: 'export.interrupted_title',
    text: 'error.export_interrupted',
    icon: 'pageHidden',
    action: 'action.try_again',
  },
  no_space: {
    title: 'export.no_space_title',
    text: 'error.no_space',
    icon: 'storage',
    action: 'action.change_settings',
  },
} as const satisfies Record<string, { title: string; text: string; icon: IconName; action: string }>;

function Running({ view }: { view: Extract<RunView, { phase: 'running' | 'cancelling' }> }) {
  const cancelling = view.phase === 'cancelling';
  const p = progressText(view.fraction, view.phase === 'running' ? view.remainingMs : null);
  const announced = useThrottled(cancelling ? t('export.cancelling') : plain(p));
  return (
    <>
      <div class="tk-run__title-row">
        <Icon name="export" size={20} />
        <h2 id={TITLE_ID} class="tk-run__title">
          {t('export.title')}
        </h2>
      </div>
      <p id={TEXT_ID} class="tk-run__text" data-muted={cancelling ? '' : undefined} aria-hidden="true">
        {cancelling ? t('export.cancelling') : marked(p.text, p.values)}
      </p>
      <p class="tk-run__live" aria-live="polite">
        {announced}
      </p>
      <progress
        class="tk-run__bar"
        data-stopped={cancelling ? '' : undefined}
        value={Math.floor(view.fraction * 100)}
        max={100}
        aria-label={t('export.progress_label')}
      />
      {cancelling ? null : <p class="tk-run__keep">{t('export.keep_open')}</p>}
      <div class="tk-run__actions">
        <button
          type="button"
          class="tk-run__button"
          data-action="cancel-export"
          disabled={cancelling}
          onClick={cancelExport}
        >
          {t('action.cancel')}
        </button>
      </div>
    </>
  );
}

function Done({ view }: { view: Extract<RunView, { phase: 'done' }> }) {
  return (
    <>
      <div class="tk-run__title-row">
        <Icon name="success" size={20} class="tk-run__icon--ok" />
        <h2 id={TITLE_ID} class="tk-run__title">
          {t('export.title')}
        </h2>
      </div>
      <p id={TEXT_ID} class="tk-run__text" role="status">
        {marked(t('export.done', { name: mark(0) }), [view.fileName])}
      </p>
      <div class="tk-run__actions">
        <button type="button" class="tk-run__button" data-action="close-export" onClick={closeRun}>
          {t('action.close')}
        </button>
        {view.share ? (
          <button
            type="button"
            class="tk-run__button tk-run__button--outlined"
            data-action="share"
            onClick={() => void shareExport()}
          >
            <Icon name="share" size={16} />
            {t('action.share')}
          </button>
        ) : null}
      </div>
    </>
  );
}

function Ended({ phase, kind }: { phase: keyof typeof ERRORS; kind?: ExportKind | undefined }) {
  const e = ERRORS[phase];
  // F-016.R3 (build question 201): a failed GIF or audio export names its own remedy.
  const text = phase === 'failed' ? failedTextId(kind) : e.text;
  return (
    <>
      <div class="tk-run__title-row">
        <Icon name={e.icon} size={20} class="tk-run__icon--bad" />
        <h2 id={TITLE_ID} class="tk-run__title tk-run__title--bad">
          {t(e.title)}
        </h2>
      </div>
      <p id={TEXT_ID} class="tk-run__text">
        {t(text)}
      </p>
      <div class="tk-run__actions">
        <button type="button" class="tk-run__button" data-action="close-export" onClick={closeRun}>
          {t('action.close')}
        </button>
        <button
          type="button"
          class="tk-run__button tk-run__button--outlined"
          data-action={phase === 'interrupted' ? 'try-again' : 'change-settings'}
          onClick={phase === 'interrupted' ? tryAgain : changeSettings}
        >
          {t(e.action)}
        </button>
      </div>
    </>
  );
}

export function ExportProgress() {
  const view = run.value;
  void language.value;
  const dialog = useRef<HTMLDialogElement>(null);
  const phase = view?.phase ?? null;
  // Open as a modal dialog (the editor behind is inert), and close when the run's dialog goes away.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return undefined;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) d.close();
      // Focus returns to the toolbar's Export when it closes (CMP-ExportProgress "Accessibility"); the panel
      // takes it instead when Change settings reopens it.
      if (!panelOpen.peek()) focusOpener();
    };
  }, [phase !== null]);
  // Focus starts on Cancel while running and on the first action in the end states.
  useEffect(() => {
    if (phase === 'cancelling') return;
    dialog.current?.querySelector<HTMLButtonElement>('.tk-run__actions button:not(:disabled)')?.focus();
  }, [phase]);
  if (!view) return null;
  const error = view.phase === 'failed' || view.phase === 'interrupted' || view.phase === 'no_space';
  const escape = (): void => {
    if (view.phase === 'running') cancelExport();
    else if (view.phase !== 'cancelling') closeRun();
  };
  return (
    <dialog
      ref={dialog}
      class="tk-run"
      role={error ? 'alertdialog' : 'dialog'}
      aria-labelledby={TITLE_ID}
      aria-describedby={TEXT_ID}
      data-phase={view.phase}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        escape();
      }}
      onCancel={(e) => {
        // Esc never closes the dialog by itself: it is Cancel while running, Close after.
        e.preventDefault();
        escape();
      }}
    >
      <span class="tk-run__grab" aria-hidden="true" />
      {view.phase === 'running' || view.phase === 'cancelling' ? (
        <Running view={view} />
      ) : view.phase === 'done' ? (
        <Done view={view} />
      ) : (
        <Ended phase={view.phase} kind={view.phase === 'failed' ? view.kind : undefined} />
      )}
    </dialog>
  );
}
