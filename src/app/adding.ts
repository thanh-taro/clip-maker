// MOD-App — adding media (F-001): files from the picker, a drop or a paste go to MOD-Media's intake
// (checked by content in the analysis worker, RULE-01/02), and the accepted ones become one MOD-Project
// step (RULE-13: a batch is one undo step). Batches run one after another; a batch that arrives before
// the RULE-22 check has let media in waits for it (build-spec-questions 59) and is dropped if the
// device turns out unsupported. Progress, Cancel, the media panel's refused group and the result
// notices (CMP-Notice) live here. Nothing is uploaded, copied or kept beyond the session (INV-01):
// the files stay references in MOD-Media's registry.
import { computed, effect, signal } from '@preact/signals';
import { isTooShort, type FrameRate, type Notice, type Project, type RefusalReason, type Source } from '../core';
import { language, t } from '../copy';
import {
  FAILED_REASON,
  type IntakeItem,
  type IntakeProgress,
  type IntakeResult,
  type Refusal,
  type SourceRegistry,
} from '../media';
import { addMedia, edit, history, placeSource, playhead, project, removeSource, type History } from '../project';
import { device } from './device';
import { editorLocked } from './lock';
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
/** IDs of new clips and audio clips for the session (also F-003's duplicates). */
export const nextItemId = (): string => `item-${++itemCounter}`;

/** Batches waiting for the one being checked, or for the device check (build-spec-questions 59). */
export const queued = signal(0);

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

/**
 * Shows MOD-Project's notices for an edit (refusal reasons are shown in the refused list instead).
 * Notices of one batch carry its number, so they never replace each other.
 */
export function showResultNotices(ids: readonly Notice[], batch?: number): void {
  for (const id of ids) {
    if (isRefusal(id)) continue;
    const plain = id as PlainNotice;
    showNotice({
      kind: kindOf(plain),
      tag: plain.slice('notice.'.length),
      text: () => t(plain),
      ...(batch !== undefined ? { batch } : {}),
    });
  }
}

/** COPY-error.refused_list's text before `{list}` ("Couldn't add:"), the notice title. */
function refusedTitle(): string {
  const MARK = '\u0000';
  return (t('error.refused_list', { list: MARK }).split(MARK)[0] ?? '').trim();
}

function showRefused(refused: readonly Refusal[], batch: number): void {
  if (refused.length === 0) return;
  showNotice({
    kind: 'error',
    tag: 'refused_list',
    batch,
    text: refusedTitle,
    items: refused.map((r) => ({ name: r.name, text: () => t(r.reason) })),
  });
}

/** Names joined the way the active language writes a list ("a.mp4, b.mov and c.mp4"). */
export function nameList(names: readonly string[]): string {
  return new Intl.ListFormat(language.value, { type: 'conjunction' }).format(names);
}

let batchCounter = 0;

/** Implements: F-001.R2/R3/R6, RULE-01 "Kept as a source", RULE-13 — one batch's result as one step. */
function apply(result: IntakeResult): void {
  const batch = ++batchCounter;
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
  if (added > 0) showNotice({ kind: 'success', tag: 'added', batch, text: () => t('notice.added', { count: added }) });
  // One COPY-notice.no_sound per batch, naming every silent file that was kept.
  const silent = result.notices.filter((n) => n.id === 'notice.no_sound' && present.has(n.sourceId)).map((n) => n.name);
  if (silent.length)
    showNotice({
      kind: 'info',
      tag: 'no_sound',
      batch,
      text: () => t('notice.no_sound', { name: nameList(silent), count: silent.length }),
    });
  showResultNotices(placed, batch);
  // The panel's refused group: added to while the panel is open, else only this batch's refusals.
  refusedFiles.value = panelOpen.peek() ? [...refusedFiles.value, ...refused] : refused;
  showRefused(refused, batch);
}

async function runBatch(items: readonly IntakeItem[], gen: number): Promise<void> {
  if (items.length === 0 || !(await whenAccepting()) || gen !== generation || !deps) {
    queued.value = Math.max(0, queued.value - 1);
    return;
  }
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
  queued.value = Math.max(0, queued.value - 1);
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
    // The check could not run (no analysis worker, an internal error): the files are refused with a
    // reason, never silently lost (RULE-01).
    if (!ctl.signal.aborted) {
      console.error('adding: intake failed', e);
      result = {
        accepted: [],
        refused: items.map((i) => ({ name: i.name, reason: FAILED_REASON })),
        notices: [],
        cancelled: false,
      };
    }
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
  // SCR-Editor "exporting": the editor is locked; files dropped or pasted on it then are not taken.
  if (editorLocked.peek()) {
    // Review: never silently: COPY-notice.busy_exporting says why the files were not taken.
    showNotice({ kind: 'info', tag: 'busy_exporting', text: () => t('notice.busy_exporting') });
    return Promise.resolve();
  }
  const gen = generation;
  queued.value++;
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

/** What had focus when the panel opened, to give it back on close (CMP-MediaPanel, narrow dialog). */
export let panelOpener: Element | null = null;

export function openPanel(opener: Element | null = null): void {
  if (!panelOpen.peek()) panelOpener = opener;
  panelOpen.value = true;
}

/** Bumped when the system file picker closes (picked or cancelled): the narrow sheet takes focus back. */
export const pickerClosed = signal(0);

/** CMP-MediaPanel: refused items stay listed until dismissed or the panel closes. */
export function closePanel(): void {
  panelOpen.value = false;
  refusedFiles.value = [];
}

/** The sources a history can bring back (in any step's document before or after). */
function historySources(h: History): Set<string> {
  const ids = new Set<string>();
  const add = (p: Project) => p.sources.forEach((s) => ids.add(s.id));
  for (const step of [...h.past, ...h.future]) {
    add(step.before);
    add(step.after);
  }
  return ids;
}

/**
 * Implements: ADR-0009 §7, INV-01 — after every edit, undo or redo, the registry frees the pictures of
 * sources that left the project (rebuilt lazily if undo brings them back) and forgets sources that
 * neither the project nor any history step holds, `File` reference included.
 */
export function watchSources(reg: SourceRegistry): () => void {
  return effect(() => {
    const ids = new Set(project.value.sources.map((s) => s.id));
    reg.sync(ids, historySources(history.value));
  });
}

/** Test reset (one page = one session in the app). */
export function resetAdding(): void {
  cancelAdding();
  queued.value = 0;
  chain = Promise.resolve();
  progress.value = null;
  refusedFiles.value = [];
  panelOpen.value = false;
}
