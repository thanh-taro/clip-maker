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
import { computed, effect, signal, untracked, type ReadonlySignal, type Signal } from '@preact/signals';
import { Playback, WORKLET_URL, type ToAudioWorker } from '../audio';
import type { EngineMedia, FrameRate, Micros, Project, Source, ToEngine } from '../core';
import { resolveKey, scopeOf, type Action, type FocusInfo } from '../keys';
import { musicBlob } from '../assets';
import { registry } from '../media';
import { fullscreen, mountPreview, type Fullscreen, type PreviewController } from '../preview';
import { playhead, project } from '../project';
import { t } from '../copy';
import { watchSlow } from './device';
import { dragging } from './MediaInput';
import { showNotice } from './notice-stack';
import { editingText } from './text';
import { workers } from './workers';

/** The mounted preview of the session (null until the workers run, and on SCR-Unsupported). */
export const playback = signal<{
  readonly ctl: PreviewController;
  readonly fs: Fullscreen;
  /** MOD-Audio's clock (the picture follows it). */
  readonly clock: Playback;
} | null>(null);

/** F-011.R1: the bundled track the music picker is auditioning (MOD-Audio `Playback.audition`), or null. */
export const auditionTrack = signal<string | null>(null);

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
    default:
      // Not a playback key (the arrange keys: ./arrange.ts).
      return false;
  }
  return true;
}

export interface WorkerFeed {
  readonly project: ReadonlySignal<Project>;
  readonly engine: { postMessage(m: ToEngine): void };
  readonly audio: { postMessage(m: ToAudioWorker): void };
  /** What the engine draws for a source (a video's file, a photo's bitmap); null for none. */
  readonly media: (source: Source) => Promise<EngineMedia | null>;
  /** A bundled track's packaged file (MOD-Assets), read for its sound like an audio source (F-011). */
  readonly music?: (trackId: string) => Promise<Blob>;
  /** The bundled track the music picker is auditioning (its file must reach the engine too). */
  readonly audition?: ReadonlySignal<string | null>;
  /** A bundled track's file could not be read (F-011.R7); it is read again on the next `retry` change. */
  readonly onMusicFailed?: (trackId: string) => void;
  /** Each change reads again the files still wanted and not sent (Play: a failed track read retries). */
  readonly retry?: ReadonlySignal<unknown>;
}

/**
 * The bundled tracks whose files the sound feed must serve: those the project's audio clips play (an audio
 * clip's source that is not one of the project's sources is a bundled track, ENT-MusicTrack) and the one
 * being auditioned. Implements: F-011.R5 (bundled music in the preview's mix), ADR-0008 §7.
 */
export function musicIds(p: Project, auditioned: string | null): string[] {
  const known = new Set(p.sources.map((s) => s.id));
  const ids = new Set(p.audioClips.map((a) => a.sourceId).filter((id) => !known.has(id)));
  if (auditioned) ids.add(auditioned);
  return [...ids];
}

/**
 * Feeds the workers: every project change to the audio worker (its mix is what the preview plays,
 * INV-02), and the engine the changes of the project's sources by id (ADR-0009 §7): a new source's file
 * or bitmap once, a removed source's id. Sources that stay are never sent again, so the engine keeps
 * their decoders (a source id's file never changes within a session). Audio sources go to the engine
 * too: it serves every source's encoded sound to the audio worker (the sound feed, ADR-0008 §6), and so
 * do the bundled tracks that audio clips play or the picker auditions (F-011, Q87: the packaged file
 * through the same SoundBank). The project itself reaches the engine through MOD-Preview.
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
  type Item = { id: string; music: boolean; get: () => Promise<EngineMedia | null> };
  /** The items of the latest project (what `retry` looks up again). */
  let items: readonly Item[] = [];
  /** Looks up `items` once each and sends those still wanted. */
  const lookUp = (list: readonly Item[]): void => {
    const fresh = list.filter((x) => !sent.has(x.id) && !looking.has(x.id));
    if (!fresh.length) return;
    for (const x of fresh) looking.add(x.id);
    // Each item travels when it is ready: a slow source never holds back a track the picker auditions.
    for (const x of fresh)
      void x
        .get()
        .catch(() => {
          // A failed track read is reported (F-011.R7); the next `retry` reads it again.
          if (x.music && live && wanted.has(x.id)) feed.onMusicFailed?.(x.id);
          return null;
        })
        .then((m) => {
          looking.delete(x.id);
          if (m === null || !wanted.has(m.id) || sent.has(m.id)) return;
          sent.add(m.id);
          post([m], []);
        });
  };
  const stop = effect(() => {
    const p = feed.project.value;
    const auditioned = feed.audition?.value ?? null;
    feed.audio.postMessage({ type: 'audio:setProject', project: p });
    const music = feed.music ? musicIds(p, auditioned) : [];
    wanted = new Set([...p.sources.map((s) => s.id), ...music]);
    const removed = [...sent].filter((id) => !wanted.has(id));
    for (const id of removed) sent.delete(id);
    post([], removed);
    const read = feed.music;
    items = [
      ...p.sources.map((s) => ({ id: s.id, music: false, get: () => feed.media(s) })),
      ...(read
        ? music.map((id) => ({
            id,
            music: true,
            get: async (): Promise<EngineMedia> => ({ id, kind: 'audio', file: await read(id) }),
          }))
        : []),
    ];
    lookUp(items);
  });
  // Implements: F-011.R5 — music whose read failed is read again on Play (the items not yet sent).
  const again = effect(() => {
    void feed.retry?.value;
    untracked(() => lookUp(items));
  });
  return () => {
    live = false;
    stop();
    again();
  };
}

/**
 * A bundled track's file could not be read (F-011.R7): an audition of it stops (the picker shows it
 * stopped) and COPY-notice.music_unavailable shows; a project's track is read again on Play (build
 * question 120).
 */
export function musicFailed(trackId: string): void {
  if (auditionTrack.peek() === trackId) {
    playback.peek()?.clock.stopAudition();
    auditionTrack.value = null;
  }
  showNotice({ kind: 'warning', tag: 'music_unavailable', text: () => t('notice.music_unavailable') });
}

/** The registry's file or bitmap for a source (pictures freed by ADR-0009 §7 are rebuilt first). */
async function registryMedia(source: Source): Promise<EngineMedia | null> {
  const entry = await registry.load(source.id);
  if (!entry) return null;
  if (source.kind === 'video') return { id: source.id, kind: 'video', file: entry.file };
  if (source.kind === 'photo' && entry.bitmap) return { id: source.id, kind: 'photo', bitmap: entry.bitmap };
  if (source.kind === 'audio') return { id: source.id, kind: 'audio', file: entry.file };
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
  // The sound feed: the engine worker reads the sources' encoded sound, the audio worker decodes it.
  const feed = new MessageChannel();
  engine.postMessage({ type: 'engine:soundFeed', port: feed.port1 } satisfies ToEngine, [feed.port1]);
  audio.postMessage({ type: 'audio:feed', port: feed.port2 } satisfies ToAudioWorker, [feed.port2]);
  const ctl = mountPreview(frame, { project }, { engine, clock });
  const fs = fullscreen(stage);
  const stops = [
    connectPreview(ctl, { playhead }),
    feedWorkers({
      project,
      engine,
      audio,
      media: registryMedia,
      music: musicBlob,
      audition: auditionTrack,
      onMusicFailed: musicFailed,
      retry: computed(() => ctl.state.value === 'playing'),
    }),
  ];
  clock.onAuditionEnded = () => (auditionTrack.value = null);
  playback.value = { ctl, fs, clock };
  return () => {
    clock.stopAudition();
    for (const s of stops) s();
    playback.value = null;
    void fs.exit();
    fs.dispose();
    ctl.dispose();
    void clock.dispose();
  };
}

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', '']);

/** The scope a text being edited gives every key, wherever focus is (F-010, RULE-20). */
const EDITING: FocusInfo = {
  tag: 'textarea',
  role: null,
  type: null,
  editable: true,
  inDialog: false,
  scrollable: false,
};

/**
 * The focused element as MOD-Keys' scope check reads it. RULE-20: while a text layer is edited (CMP-TextEditor
 * open, focus in its field, on Done or on its bar's controls) every key is a field's: no shortcut acts.
 */
export function focusInfo(el: Element | null): FocusInfo | null {
  if (editingText.peek() !== null) return EDITING;
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
