// MOD-App — adding media (F-001): files from the picker, a drop or a paste go to MOD-Media's intake
// (checked by content in the analysis worker, RULE-01/02), and the accepted ones become one MOD-Project
// step (RULE-13: a batch is one undo step). Batches run one after another; a batch that arrives before
// the RULE-22 check has let media in waits for it (build-spec-questions 59) and is dropped if the
// device turns out unsupported. Progress, Cancel, the media panel's refused group and the result
// notices (CMP-Notice) live here. Nothing is uploaded, copied or kept beyond the session (INV-01):
// the files stay references in MOD-Media's registry.
import { computed, effect, signal } from '@preact/signals';
import { isTooShort, type FrameRate, type Notice, type RefusalReason, type Source } from '../core';
import { t } from '../copy';
import type { IntakeItem, IntakeProgress, IntakeResult, Refusal } from '../media';
import { addMedia, edit, placeSource, playhead, project, removeSource } from '../project';
import { device } from './device';
import { closeNotice, showNotice, type NoticeKind } from './notice-stack';

export interface AddingDeps {
  /** MOD-Media `intake` with the session's analysis worker. */
  intake(
    items: readonly IntakeItem[],
    onProgress: (p: IntakeProgress) => void,
    signal: AbortSignal,
    ctx: { readonly sourceCount: number; readonly rate: FrameRate },
  ): Promise<IntakeResult>;
  /** MOD-Media `registry.release`: a checked source the project did not keep. */
  release(sourceId: string): void;
}

let deps: AddingDeps | null = null;

/** MOD-App `main()` wires the real intake once the workers start. */
export function configureAdding(d: AddingDeps): void {
  deps = d;
}

/** The file being checked (CMP-MediaPanel "checking", CMP-Notice "progress"); null when idle. */
export const progress = signal<IntakeProgress | null>(null);
/** CMP-MediaPanel "refused": listed until dismissed or the panel closes. */
export const refusedFiles = signal<readonly Refusal[]>([]);
/** CMP-MediaPanel is open (wide: left drawer; narrow: bottom sheet). */
export const panelOpen = signal(false);
/** F-001.AC11, RULE-03: export needs a clip on the main track (COPY-notice.needs_clip). */
export const needsClip = computed(() => project.value.clips.length === 0);

let itemCounter = 0;
/** IDs of new clips and audio clips for the session. */
const nextItemId = (): string => `item-${++itemCounter}`;

let chain: Promise<void> = Promise.resolve();
let current: AbortController | null = null;
/** Bumped by Cancel: batches queued before it are dropped (F-001.R6 "and the rest"). */
let generation = 0;

/** Resolves true once media is accepted, false if the device turns out unsupported (RULE-22). */
function whenAccepting(): Promise<boolean> {
  const now = device.peek().status;
  if (now === 'supported' || now === 'unsupported') return Promise.resolve(now === 'supported');
  return new Promise((resolve) => {
    let done = false;
    const dispose = effect(() => {
      const s = device.value.status;
      if (done || (s !== 'supported' && s !== 'unsupported')) return;
      done = true;
      resolve(s === 'supported');
      queueMicrotask(() => dispose());
    });
  });
}

/** CMP-Notice severity of a MOD-Project result notice (CMP-Notice "Variants & states"). */
function kindOf(id: Notice): NoticeKind {
  return id === 'notice.length_full' ||
    id === 'notice.no_audio_room' ||
    id === 'notice.split_too_close' ||
    id === 'notice.text_limit'
    ? 'warning'
    : 'info';
}

type PlainNotice = Exclude<Notice, RefusalReason>;
const isRefusal = (id: Notice): id is Notice & RefusalReason => id.startsWith('reason.');

/** Shows MOD-Project's notices for an edit (refusal reasons are shown in the refused list instead). */
export function showResultNotices(ids: readonly Notice[]): void {
  for (const id of ids) {
    if (isRefusal(id)) continue;
    const plain = id as PlainNotice;
    showNotice({ kind: kindOf(plain), tag: plain.slice('notice.'.length), text: () => t(plain) });
  }
}

/** COPY-error.refused_list's text before `{list}` ("Couldn't add:"), the notice title. */
function refusedTitle(): string {
  const MARK = '\u0000';
  return (t('error.refused_list', { list: MARK }).split(MARK)[0] ?? '').trim();
}

function showRefused(refused: readonly Refusal[]): void {
  if (refused.length === 0) return;
  showNotice({
    kind: 'error',
    tag: 'refused_list',
    text: refusedTitle,
    items: refused.map((r) => ({ name: r.name, text: () => t(r.reason) })),
  });
}

/** Implements: F-001.R2/R3/R6, RULE-01 "Kept as a source", RULE-13 — one batch's result as one step. */
function apply(result: IntakeResult): void {
  const sources: Source[] = result.accepted.map((a) => a.source);
  const placed = edit((p) => addMedia(p, sources, playhead.peek(), nextItemId));
  const present = new Set(project.peek().sources.map((s) => s.id));
  const lost = result.accepted.filter((a) => !present.has(a.source.id));
  for (const a of lost) deps?.release(a.source.id);
  const lostReason = (s: Source): RefusalReason => (isTooShort(s) ? 'reason.too_short' : 'reason.too_many');
  const refused: Refusal[] = [
    ...result.refused,
    ...lost.map((a) => ({ name: a.source.name, reason: lostReason(a.source) })),
  ];
  const added = result.accepted.length - lost.length;
  if (added > 0) showNotice({ kind: 'success', tag: 'added', text: () => t('notice.added', { count: added }) });
  for (const n of result.notices) {
    if (!present.has(result.accepted.find((a) => a.source.name === n.name)?.source.id ?? '')) continue;
    showNotice({ kind: 'info', tag: 'no_sound', text: () => t('notice.no_sound', { name: n.name }) });
  }
  showResultNotices(placed);
  refusedFiles.value = [...refusedFiles.value, ...refused];
  showRefused(refused);
}

async function runBatch(items: readonly IntakeItem[], gen: number): Promise<void> {
  if (items.length === 0 || !(await whenAccepting()) || gen !== generation || !deps) return;
  const ctl = new AbortController();
  current = ctl;
  const key = showNotice({
    kind: 'progress',
    tag: 'adding',
    text: () => {
      const p = progress.value;
      return p ? t('notice.adding', { done: p.position, total: p.total }) : '';
    },
  });
  let result: IntakeResult | null = null;
  try {
    const p = project.peek();
    result = await deps.intake(
      items,
      (pr) => {
        if (!ctl.signal.aborted) progress.value = pr;
      },
      ctl.signal,
      { sourceCount: p.sources.length, rate: p.frame.frameRate },
    );
  } catch (e) {
    if (!ctl.signal.aborted) console.error('adding: intake failed', e);
  } finally {
    current = null;
    progress.value = null;
    closeNotice(key);
  }
  if (result) apply(result);
}

/**
 * Implements: F-001.R1 — adds a picked, dropped or pasted batch. Resolves when the batch has been
 * applied, or dropped (cancelled, or the device turned out unsupported).
 */
export function addFiles(items: readonly IntakeItem[]): Promise<void> {
  const gen = generation;
  const run = chain.then(() => runBatch(items, gen));
  chain = run.catch(() => undefined);
  return run;
}

/** Implements: F-001.R6 — keeps the files whose check has finished; drops the one being checked and the rest. */
export function cancelAdding(): void {
  generation++;
  current?.abort();
}

/** Implements: F-001.R4, AC14 — Add to timeline: a new clip of the whole source, as one undo step. */
export function placeAgain(sourceId: string): void {
  showResultNotices(edit((p) => placeSource(p, sourceId, playhead.peek(), nextItemId)));
}

/**
 * Implements: F-001.R4, AC6 — Delete removes the source and all its clips as one undo step. The file
 * reference stays in the registry while history can restore it (MOD-Media).
 */
export function removeMedia(sourceId: string): void {
  showResultNotices(edit((p) => removeSource(p, sourceId)));
}

export function dismissRefused(index: number): void {
  refusedFiles.value = refusedFiles.value.filter((_, i) => i !== index);
}

export function openPanel(): void {
  panelOpen.value = true;
}

/** CMP-MediaPanel: refused items stay listed until dismissed or the panel closes. */
export function closePanel(): void {
  panelOpen.value = false;
  refusedFiles.value = [];
}

/** Test reset (one page = one session in the app). */
export function resetAdding(): void {
  cancelAdding();
  chain = Promise.resolve();
  progress.value = null;
  refusedFiles.value = [];
  panelOpen.value = false;
}
