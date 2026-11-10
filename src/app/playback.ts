// MOD-App — playback wiring for CMP-Preview (F-002): composes MOD-Preview's controller with the engine
// worker and MOD-Audio's clock (the picture follows the sound, ADR-0008 §5), binds it to MOD-Project's
// `playhead`, feeds the workers the session's project and sources, follows the slow-device signal into
// the session notice (F-023.AC7, build question 62), and runs the RULE-20 playback keys.
//
// The playhead binding (for F-003's timeline): MOD-Project's `playhead` signal is the one playhead of
// the session. While playing, the controller's time drives it; anything else that sets it (the ruler,
// a touch scroll, undo/redo per RULE-13) seeks the preview there, latest wins (F-002.R3). On touch, a
// scroll that scrubs pauses playback first (RULE-14): call `pauseForScrub()` when it starts.
// Implements: F-002.R1–R5 (wiring), F-002.R7 (full screen state), RULE-20 Playback, F-023.AC7.
import { effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import { Playback, WORKLET_URL, type ToAudioWorker } from '../audio';
import type { EngineMedia, FrameRate, Micros, Project, Source, ToEngine } from '../core';
import { resolveKey, scopeOf, type Action, type FocusInfo } from '../keys';
import { registry } from '../media';
import { fullscreen, mountPreview, type Fullscreen, type PreviewController } from '../preview';
import { playhead, project } from '../project';
import { watchSlow } from './device';
import { dragging } from './MediaInput';
import { workers } from './workers';

/** The mounted preview of the session (null until the workers run, and on SCR-Unsupported). */
export const playback = signal<{
  readonly ctl: PreviewController;
  readonly fs: Fullscreen;
  /** MOD-Audio's clock (the picture follows it). */
  readonly clock: Playback;
} | null>(null);

/**
 * Binds the controller to MOD-Project's playhead both ways and follows its slow-device signal. The
 * playhead set before mounting is where the preview starts.
 */
export function connectPreview(
  ctl: Pick<PreviewController, 'time' | 'seek' | 'slowDevice'>,
  signals: { readonly playhead: Signal<Micros> },
): () => void {
  const { playhead: head } = signals;
  // The playhead moved elsewhere (timeline, undo): the preview seeks there.
  const toPreview = effect(() => {
    const t = head.value;
    if (t !== ctl.time.peek()) ctl.seek(t);
  });
  // The preview moved (playing, stepping, a clamp at the end): the playhead follows.
  const toPlayhead = effect(() => {
    const t = ctl.time.value;
    if (head.peek() !== t) head.value = t;
  });
  const stopSlow = watchSlow(ctl.slowDevice);
  return () => {
    toPreview();
    toPlayhead();
    stopSlow();
  };
}

/** Pauses playback before a touch scroll scrubs (RULE-14, F-013.AC7); the scroll then sets the playhead. */
export function pauseForScrub(): void {
  playback.peek()?.ctl.pause();
}

/**
 * RULE-20 *Playback* on the controller: Space plays and pauses, Left/Right one frame (Shift: 1 s),
 * Home/End the start and end. Returns false when nothing applies (no picture to play: the transport
 * is unavailable), so the key keeps the browser's default.
 */
export function runAction(
  ctl: Pick<PreviewController, 'duration' | 'toggle' | 'step' | 'toStart' | 'toEnd'>,
  action: Action,
  rate: FrameRate,
): boolean {
  if (action === 'escape' || ctl.duration.peek() <= 0) return false;
  switch (action) {
    case 'play-pause':
      ctl.toggle();
      break;
    case 'frame-back':
      ctl.step(-1);
      break;
    case 'frame-forward':
      ctl.step(1);
      break;
    case 'second-back':
      ctl.step(-rate);
      break;
    case 'second-forward':
      ctl.step(rate);
      break;
    case 'go-start':
      ctl.toStart();
      break;
    case 'go-end':
      ctl.toEnd();
      break;
  }
  return true;
}

export interface WorkerFeed {
  readonly project: ReadonlySignal<Project>;
  readonly engine: { postMessage(m: ToEngine): void };
  readonly audio: { postMessage(m: ToAudioWorker): void };
  /** What the engine draws for a source (a video's file, a photo's bitmap); null for none. */
  readonly media: (source: Source) => Promise<EngineMedia | null>;
}

/**
 * Feeds the workers: every project change to the audio worker (its mix is what the preview plays,
 * INV-02), and the engine the changes of the project's video and photo sources by id (ADR-0009 §7): a
 * new source's file or bitmap once, a removed source's id. Sources that stay are never sent again, so
 * the engine keeps their decoders (a source id's file never changes within a session). The project
 * itself reaches the engine through MOD-Preview.
 */
export function feedWorkers(feed: WorkerFeed): () => void {
  /** Ids the engine has. */
  const sent = new Set<string>();
  /** Ids whose lookup is running. */
  const looking = new Set<string>();
  let wanted = new Set<string>();
  let live = true;
  const post = (add: EngineMedia[], remove: string[]): void => {
    if (live && (add.length || remove.length)) feed.engine.postMessage({ type: 'engine:mediaChanges', add, remove });
  };
  const stop = effect(() => {
    const p = feed.project.value;
    feed.audio.postMessage({ type: 'audio:setProject', project: p });
    const visual = p.sources.filter((s) => s.kind === 'video' || s.kind === 'photo');
    wanted = new Set(visual.map((s) => s.id));
    const removed = [...sent].filter((id) => !wanted.has(id));
    for (const id of removed) sent.delete(id);
    post([], removed);
    const fresh = visual.filter((s) => !sent.has(s.id) && !looking.has(s.id));
    if (!fresh.length) return;
    for (const s of fresh) looking.add(s.id);
    void Promise.all(fresh.map((s) => feed.media(s).catch(() => null))).then((list) => {
      for (const s of fresh) looking.delete(s.id);
      const add = list.filter((m): m is EngineMedia => m !== null && wanted.has(m.id) && !sent.has(m.id));
      for (const m of add) sent.add(m.id);
      post(add, []);
    });
  });
  return () => {
    live = false;
    stop();
  };
}

/** The registry's file or bitmap for a source (pictures freed by ADR-0009 §7 are rebuilt first). */
async function registryMedia(source: Source): Promise<EngineMedia | null> {
  const entry = await registry.load(source.id);
  if (!entry) return null;
  if (source.kind === 'video') return { id: source.id, kind: 'video', file: entry.file };
  if (source.kind === 'photo' && entry.bitmap) return { id: source.id, kind: 'photo', bitmap: entry.bitmap };
  return null;
}

/**
 * Mounts the session's preview on `frame` (the element whose canvas goes to the engine) with full
 * screen on `stage`. Needs the engine and audio workers; returns the unmount.
 */
export function mountPlayback(frame: HTMLElement, stage: HTMLElement): () => void {
  const engine = workers.get('engine');
  const audio = workers.get('audio');
  if (!engine || !audio) return () => undefined;
  const clock = new Playback(audio, WORKLET_URL);
  const ctl = mountPreview(frame, { project }, { engine, clock });
  const fs = fullscreen(stage);
  const stops = [connectPreview(ctl, { playhead }), feedWorkers({ project, engine, audio, media: registryMedia })];
  playback.value = { ctl, fs, clock };
  return () => {
    for (const s of stops) s();
    playback.value = null;
    void fs.exit();
    fs.dispose();
    ctl.dispose();
    void clock.dispose();
  };
}

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']);

/** The focused element as MOD-Keys' scope check reads it. */
export function focusInfo(el: Element | null): FocusInfo | null {
  if (!el || el === document.body || el === document.documentElement) return null;
  const tag = el.tagName.toLowerCase();
  const type = tag === 'input' ? ((el as HTMLInputElement).type || '').toLowerCase() : null;
  const editable =
    (el as HTMLElement).isContentEditable ||
    tag === 'textarea' ||
    tag === 'select' ||
    (tag === 'input' && TEXT_INPUTS.has(type ?? ''));
  const style = getComputedStyle(el);
  const scrolls = (overflow: string, size: number, client: number) => /auto|scroll/.test(overflow) && size > client;
  return {
    tag,
    role: el.getAttribute('role'),
    type,
    editable,
    scrollable:
      scrolls(style.overflowY, el.scrollHeight, el.clientHeight) ||
      scrolls(style.overflowX, el.scrollWidth, el.clientWidth),
    inDialog: el.closest('dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"]') !== null,
  };
}

/** An overlay that Esc closes is open: the drop overlay, a dialog or modal sheet, a popover or a menu. */
export function overlayOpen(doc: Document = document): boolean {
  return (
    dragging.peek() ||
    doc.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"]') !==
      null
  );
}

/**
 * The DOM binder for the playback keys (RULE-20) on the tool's document: acts only within the scope,
 * and takes a key from the browser only when it acted. Esc leaves the maximised preview (the browser
 * leaves its own full screen by itself).
 */
export function bindPlaybackKeys(doc: Document = document): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    const p = playback.peek();
    if (!p) return;
    const action = resolveKey(e, scopeOf(focusInfo(doc.activeElement), e.code));
    if (!action) return;
    if (action === 'escape') {
      // One Esc does one thing: an open overlay (drop overlay, dialog, sheet, popover, menu) takes it.
      if (overlayOpen(doc)) return;
      if (p.fs.mode.peek() === 'maximised') {
        e.preventDefault();
        void p.fs.exit();
      }
      return;
    }
    if (runAction(p.ctl, action, project.peek().frame.frameRate)) e.preventDefault();
  };
  doc.addEventListener('keydown', onKey);
  return () => doc.removeEventListener('keydown', onKey);
}
