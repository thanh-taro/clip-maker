// MOD-App — the user-facing video export (F-015): what CMP-ExportPanel offers and estimates, and the run that
// CMP-ExportProgress shows (running, cancelling, done, failed, interrupted, no space). MOD-Export does the
// work (estimate, start, cancel, hand-over, scratch); this file wires the session's real data into it: the
// project as it is when Export is pressed, every source's file or picture from MOD-Media's registry and the
// bundled tracks its audio clips play (build question 117), the look tables the engine uses (Q148), the text
// layers rasterised at the output size before the start (Q170), the capability record of the start-up probe
// with the trial encodes and the size × rate grid probed when the panel first opens (ADR-0004 outcome).
// While an export runs the editor is locked (SCR-Editor "exporting", Q96/Q100): ./lock.ts.
// A successful video export marks the project exported (RULE-19) as it was when the export started, so an
// edit landing meanwhile (a media batch that was already being checked) stays unexported.
// Implements: F-015.R1–R3, F-015.R5–R7, F-015.R9, RULE-15 (offers, default, size target), RULE-19 (signal),
// RULE-23 (settings kept for the session), D-018, D-020, CMP-ExportPanel "Behavior", CMP-ExportProgress
// "Behavior".
import { computed, effect, signal, untracked } from '@preact/signals';
import { musicBlob } from '../assets';
import {
  audioFormatOffers,
  chooseAudioFormat,
  chooseVideoFormat,
  probeExportGrid,
  trialAudioEncode,
  trialVideoEncode,
  videoEncoderConfig,
  type Capabilities,
  type GridCell,
  type VideoCodecId,
  type VideoTrial,
} from '../codec';
import {
  frameAspect,
  videoOutputSize,
  type EngineMedia,
  type ExportQuality,
  type ExportSettings,
  type Project,
  type TextBitmap,
  type VideoResolution,
} from '../core';
import { deviceClass, platformHints } from '../engine';
import {
  downloadBlob,
  estimate as estimateExport,
  hasSound,
  start as startExport,
  type EstimateResult,
  type ExportCaps,
  type ExportContext,
  type ExportHandle,
  type ExportResult,
} from '../export';
import { canShareFile } from '../host';
import { markExported, exportMark, project } from '../project';
import { textBitmaps } from '../preview';
import { needsClip } from './adding';
import { capabilities } from './device';
import { editorLocked } from './lock';
import { lookTables } from './looks';
import { musicIds, playback, registryMedia } from './playback';
import { editingText, finishEditing } from './text';
import { exportWorkers, scratchReady } from './workers';

// ── RULE-15 offers (pure) ────────────────────────────────────────────────────────────────────────

export const RESOLUTIONS: readonly VideoResolution[] = [480, 720, 1080, 1440, 2160];
/** RULE-15: the size target's quick choices. */
export const QUICK_TARGETS: readonly number[] = [8, 10, 25, 50];
/** RULE-15: a size target is a whole number of MB from 1 to 4000. */
export const TARGET_MIN = 1;
export const TARGET_MAX = 4000;

/** Why a resolution isn't offered (CMP-ExportPanel "resolution unavailable"). */
export type ResolutionState = 'ok' | 'needs_source' | 'no_encoder';
export interface ResolutionOffer {
  readonly resolution: VideoResolution;
  readonly state: ResolutionState;
}

/**
 * Implements: RULE-15 *Resolution*, F-015.AC1 — a size is offered only when the device can encode it at the
 * project's frame rate (the export grid; until it is probed, the start-up probe's 1080p30 answer stands for
 * 480–1080 and the larger sizes wait), and above 1080 only when a video or photo source's shorter side (after
 * rotation and the RULE-02 scale-down, as the sources record it) is at least that size. A size the device
 * can't encode reads COPY-export.res_no_encoder, whatever the sources.
 */
export function resolutionOffers(
  p: Pick<Project, 'sources' | 'frame'>,
  encodes: boolean,
  grid: readonly GridCell[] | null,
): ResolutionOffer[] {
  const largest = Math.max(
    0,
    ...p.sources
      .filter((s) => (s.kind === 'video' || s.kind === 'photo') && s.width && s.height)
      .map((s) => Math.min(s.width!, s.height!)),
  );
  return RESOLUTIONS.map((resolution) => {
    const cell = grid?.find((c) => c.short === resolution && c.rate === p.frame.frameRate);
    const encodable = grid ? cell?.supported === true : encodes && resolution <= 1080;
    if (!encodable) return { resolution, state: 'no_encoder' };
    if (resolution > 1080 && largest < resolution) return { resolution, state: 'needs_source' };
    return { resolution, state: 'ok' };
  });
}

/** Implements: RULE-15 — the default is 1080, or the largest offered size below it (null: none offered). */
export function defaultResolution(offers: readonly ResolutionOffer[]): VideoResolution | null {
  const ok = offers.filter((o) => o.state === 'ok' && o.resolution <= 1080).map((o) => o.resolution);
  return ok.length ? (Math.max(...ok) as VideoResolution) : null;
}

/** The session's video choice (ENT-ExportSettings: kept for the session, not an undo step; RULE-13/23). */
export interface VideoChoice {
  /** null: RULE-15's default for the project. */
  readonly resolution: VideoResolution | null;
  readonly quality: ExportQuality;
  /** "Under X MB": replaces the quality level while set (CMP-ExportPanel "Behavior"). */
  readonly targetMB: number | null;
}

export const DEFAULT_CHOICE: VideoChoice = { resolution: null, quality: 'balanced', targetMB: null };

/** The chosen resolution when it is offered, else the default. */
export function chosenResolution(choice: VideoChoice, offers: readonly ResolutionOffer[]): VideoResolution | null {
  const picked = offers.find((o) => o.resolution === choice.resolution);
  return picked?.state === 'ok' ? picked.resolution : defaultResolution(offers);
}

/** The ExportSettings of a choice at a resolution (RULE-15: a size target replaces the quality level). */
export function settingsOf(choice: VideoChoice, resolution: VideoResolution): ExportSettings {
  return {
    kind: 'video',
    resolution,
    quality: choice.quality,
    ...(choice.targetMB !== null ? { targetMB: choice.targetMB } : {}),
  };
}

/** RULE-15: a custom size target is a whole number from 1 to 4000 (digits only); anything else is none. */
export function parseTarget(text: string): number | null {
  const s = text.trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const n = Number(s);
  return n >= TARGET_MIN && n <= TARGET_MAX ? n : null;
}

/** What the panel says about the size target (CMP-ExportPanel "lower res", RULE-15, D-020). */
export type TargetAdvice =
  | { readonly kind: 'none' }
  | { readonly kind: 'lower_res'; readonly fit: VideoResolution }
  | { readonly kind: 'unreachable'; readonly min: number };

/** Implements: F-015.R2 / AC2 — the advice of an estimate: a lower resolution, or the smallest whole-MB target. */
export function targetAdvice(e: EstimateResult | null): TargetAdvice {
  if (!e || e.reachable) return { kind: 'none' };
  if (e.suggestedResolution) return { kind: 'lower_res', fit: e.suggestedResolution };
  if (e.smallestTargetMB) return { kind: 'unreachable', min: e.smallestTargetMB };
  return { kind: 'none' };
}

/** The MIME type of a finished file, for the File given to the share sheet (RULE-15 formats). */
export const mimeOf = (fileName: string): string =>
  fileName.endsWith('.webm') ? 'video/webm' : fileName.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';

// ── The session's export capability record (ADR-0004 outcome) ───────────────────────────────────

/** Trial encodes once per codec per session; a codec whose trial fails is dropped for the session. */
const videoTrials = new Map<VideoCodecId, Promise<VideoTrial>>();
let audioTrials: Promise<ExportCaps['audio']> | null = null;
const grids = new Map<VideoCodecId, Promise<GridCell[]>>();

const videoTrial = (codec: VideoCodecId): Promise<VideoTrial> => {
  let p = videoTrials.get(codec);
  if (!p) {
    p = trialVideoEncode(videoEncoderConfig(codec, 640, 480, 30));
    videoTrials.set(codec, p);
  }
  return p;
};

const soundTrials = (caps: Capabilities): Promise<ExportCaps['audio']> =>
  (audioTrials ??= (async () => {
    const out: { -readonly [K in keyof ExportCaps['audio']]: ExportCaps['audio'][K] } = {};
    for (const codec of ['aac', 'opus'] as const) {
      if (!caps.audioEncode[codec]) continue;
      const t = await trialAudioEncode(codec).catch(() => null);
      if (t?.ok && t.encoderDelay !== null)
        out[codec] = { encoderDelay: t.encoderDelay, deliveredKbps: t.deliveredKbps };
    }
    return out;
  })());

/**
 * Implements: RULE-15 *Output*, ADR-0004 §3/§5 — the first format of the fallback order whose encoders pass
 * the start-up probe and whose video trial encode works (a failed trial drops that codec for the session,
 * MOD-Codec), with the trial's latency mode, acceleration and bitrate modes. Null: no video format works.
 */
export async function exportCaps(caps: Capabilities, sound: boolean): Promise<ExportCaps | null> {
  const failed = new Set<VideoCodecId>();
  for (;;) {
    const usable = { ...caps, encode: { ...caps.encode } };
    for (const c of failed) usable.encode[c] = false;
    const f = chooseVideoFormat(usable, sound);
    if (!f) return null;
    const trial = await videoTrial(f.video).catch(() => null);
    if (!trial?.ok) {
      failed.add(f.video);
      continue;
    }
    // A sound encoder whose trial failed leaves the formats that need it out (RULE-22, F-023.R5).
    const audio = sound ? await soundTrials(caps) : {};
    if (sound && f.audio && !audio[f.audio]) {
      const withoutSound = { ...usable, audioEncode: { aac: !!audio.aac, opus: !!audio.opus } };
      const g = chooseVideoFormat(withoutSound, true);
      if (g && g.video === f.video) return capsOf(g, caps, trial, audio);
      if (!g) return null;
    }
    return capsOf({ ...f, fallback: f.fallback || failed.size > 0 }, caps, trial, audio);
  }
}

function capsOf(
  f: NonNullable<ReturnType<typeof chooseVideoFormat>>,
  caps: Capabilities,
  trial: VideoTrial,
  audio: ExportCaps['audio'],
): ExportCaps {
  return {
    videoFormat: f,
    audioFormat: chooseAudioFormat(caps),
    video: {
      latencyMode: trial.latencyMode ?? 'realtime',
      acceleration: trial.acceleration ?? 'no-preference',
      bitrateModes: trial.bitrateModes,
    },
    audio,
  };
}

/** The size × rate grid of a codec, probed once per session when the panel first needs it (ADR-0004). */
const gridOf = (codec: VideoCodecId): Promise<GridCell[]> => {
  let p = grids.get(codec);
  if (!p) {
    p = probeExportGrid(codec).catch(() => []);
    grids.set(codec, p);
  }
  return p;
};

/** F-023.R5: whether the audio-only compressed format exists (used by F-016; kept beside the others). */
export const compressedAudioOffered = (caps: Capabilities): boolean => audioFormatOffers(caps).length > 1;

// ── Panel state ──────────────────────────────────────────────────────────────────────────────────

/** CMP-ExportPanel is open (SCR-Editor "exporting-setup"). */
export const panelOpen = signal(false);
/** The session's video choice (RULE-23: kept across new projects). */
export const videoChoice = signal<VideoChoice>(DEFAULT_CHOICE);
/** The capability record for the project's sound, once known (null while being worked out). */
export const sessionCaps = signal<ExportCaps | null>(null);
/** No video format works on this device after the trial encodes (RULE-22 left the editor open). */
export const noFormat = signal(false);
/** The grid of the chosen codec (null until probed). */
export const exportGrid = signal<readonly GridCell[] | null>(null);

/** RULE-15: the sizes the panel offers for the session's project. */
export const offers = computed(() => {
  const caps = capabilities.value;
  const encodes = caps ? Object.values(caps.encode).some(Boolean) : false;
  return resolutionOffers(project.value, encodes, exportGrid.value);
});
export const resolution = computed(() => chosenResolution(videoChoice.value, offers.value));

export type EstimateView =
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly result: EstimateResult }
  | { readonly status: 'failed' };
/** The panel's estimate for the current settings (COPY-export.estimate, F-015.R2). */
export const estimateView = signal<EstimateView>({ status: 'pending' });

/**
 * Implements: CMP-ExportPanel "Behavior" — Export is possible when there is a clip (RULE-03), a format and a
 * resolution, and a size target is known to be reachable at the chosen size.
 */
export const canExport = computed(() => {
  if (needsClip.value || noFormat.value || resolution.value === null || !sessionCaps.value) return false;
  if (videoChoice.value.targetMB === null) return true;
  const e = estimateView.value;
  return e.status === 'ready' && e.result.reachable;
});

/** Chooses a resolution (UI state). A size target's advice is worked out again. */
export function chooseResolution(r: VideoResolution): void {
  videoChoice.value = { ...videoChoice.value, resolution: r };
}
/** Chooses a quality level; it clears the size target (one choice, RULE-15). */
export function chooseQuality(q: ExportQuality): void {
  videoChoice.value = { ...videoChoice.value, quality: q, targetMB: null };
}
/** Chooses a size target; it clears the quality level's selection (one choice, RULE-15). */
export function chooseTarget(mb: number | null): void {
  videoChoice.value = { ...videoChoice.value, targetMB: mb };
}

/** Where focus returns when the panel or the progress dialog closes (the toolbar's Export). */
let opener: HTMLElement | null = null;
export function setExportOpener(el: HTMLElement | null): void {
  opener = el;
}
const focusOpener = (): void => {
  if (opener?.isConnected) opener.focus();
};

/** Opens CMP-ExportPanel (COPY-action.export; Mod+E with F-017). */
export function openPanel(): void {
  if (editorLocked.peek()) return;
  // Only one panel at a time: a running playback keeps going, an open text editor ends (one step).
  if (editingText.peek() !== null) finishEditing();
  panelOpen.value = true;
}

/** Closes the panel without exporting (Esc, Cancel, Close); focus returns to the toolbar's Export. */
export function closePanel(returnFocus = true): void {
  if (!panelOpen.peek()) return;
  panelOpen.value = false;
  if (exportWorkers?.busy) exportWorkers.renew(); // a calibration still running is dropped
  if (returnFocus) focusOpener();
}

// ── The export's context: the session's real data (Q117, Q148, Q170) ─────────────────────────────

/** ADR-0008 outcome item 2: the final gain per mix, shared by the session's exports. */
const gains = new Map<string, number>();

/** Every source's file or picture (MOD-Media's registry) and the bundled tracks the audio clips play. */
async function mediaOf(p: Project): Promise<EngineMedia[]> {
  const sources = await Promise.all(p.sources.map((s) => registryMedia(s)));
  const music = await Promise.all(
    musicIds(p, null).map(async (id): Promise<EngineMedia> => ({ id, kind: 'audio', file: await musicBlob(id) })),
  );
  return [...sources.filter((m): m is EngineMedia => m !== null), ...music];
}

type Texts = Readonly<Record<string, TextBitmap>>;
const closeTexts = (t: Texts): void => {
  for (const b of Object.values(t)) b.bitmap.close();
};

/** The output size of a video export of `p` at `r` (RULE-15, ADR-0010 outcome item 9). */
const outputSize = (p: Project, r: VideoResolution) => videoOutputSize(frameAspect(p), r);

/** Test seam: what the export does besides MOD-Export (the app passes none; unit tests fake it). */
export interface ExportDeps {
  readonly estimate: typeof estimateExport;
  readonly start: typeof startExport;
  readonly context: (p: Project, caps: ExportCaps, texts: Texts) => Promise<ExportContext>;
  readonly texts: (p: Project, width: number, height: number) => Promise<Texts>;
  readonly now: () => number;
}

async function browserContext(p: Project, caps: ExportCaps, texts: Texts): Promise<ExportContext> {
  const workers = exportWorkers;
  const scratch = await scratchReady;
  if (!workers || !scratch) throw new Error('InvalidStateError: the export workers are not running');
  return {
    workers,
    scratch,
    caps,
    media: await mediaOf(p),
    looks: lookTables.peek(),
    texts: () => texts,
    phone: deviceClass(platformHints()) === 'phone',
    gains,
    save: (blob, fileName) => {
      const url = downloadBlob(blob, fileName);
      handedOver = { blob, fileName, url };
      return url;
    },
  };
}

let deps: ExportDeps = {
  estimate: estimateExport,
  start: startExport,
  context: browserContext,
  texts: (p, w, h) => textBitmaps(p.textLayers, w, h),
  now: () => Date.now(),
};
/** Tests replace MOD-Export and the browser context (unit tests of the panel's and the run's logic). */
export function setExportDeps(d: Partial<ExportDeps>): void {
  deps = { ...deps, ...d };
}

/** The finished file as the save hook saw it (the share sheet needs the File, F-015.R9). */
let handedOver: { blob: Blob; fileName: string; url: string } | null = null;

// ── Caps, grid and the estimate while the panel is open ───────────────────────────────────────────

let capsFor: { caps: Capabilities; sound: boolean } | null = null;

/** Works out the session's capability record for the project's sound (and the grid) when the panel opens. */
async function refreshCaps(p: Project): Promise<void> {
  const caps = capabilities.peek();
  if (!caps) return;
  const sound = hasSound(p);
  if (capsFor && capsFor.caps === caps && capsFor.sound === sound && (sessionCaps.peek() || noFormat.peek())) return;
  capsFor = { caps, sound };
  const ec = await exportCaps(caps, sound);
  if (capsFor.caps !== caps || capsFor.sound !== sound) return;
  sessionCaps.value = ec;
  noFormat.value = ec === null;
  if (ec?.videoFormat) exportGrid.value = await gridOf(ec.videoFormat.video);
}

/** The estimate is worked out again this long after the last change (CMP-ExportPanel: "as soon as"). */
export const ESTIMATE_DEBOUNCE_MS = 200;
let estimateSeq = 0;
let estimateTimer: ReturnType<typeof setTimeout> | null = null;

/** Implements: F-015.R2, CMP-ExportPanel "Behavior" — the estimate and the target's advice follow every change. */
async function runEstimate(seq: number, p: Project, settings: ExportSettings, caps: ExportCaps): Promise<void> {
  if (settings.kind !== 'video') return;
  let texts: Texts = {};
  try {
    const { width, height } = outputSize(p, settings.resolution);
    texts = await deps.texts(p, width, height);
    if (seq !== estimateSeq) return;
    const ctx = await deps.context(p, caps, texts);
    if (seq !== estimateSeq) return;
    const result = await deps.estimate(p, settings, ctx);
    if (seq === estimateSeq) estimateView.value = { status: 'ready', result };
  } catch {
    if (seq === estimateSeq) estimateView.value = { status: 'failed' };
  } finally {
    closeTexts(texts);
  }
}

function scheduleEstimate(): void {
  const seq = ++estimateSeq;
  if (estimateTimer !== null) clearTimeout(estimateTimer);
  estimateView.value = { status: 'pending' };
  // A calibration of older settings still running is dropped (the idle pair is renewed).
  if (exportWorkers?.busy) exportWorkers.renew();
  estimateTimer = setTimeout(() => {
    estimateTimer = null;
    const p = project.peek();
    const caps = sessionCaps.peek();
    const r = resolution.peek();
    if (!panelOpen.peek() || !caps || r === null || p.clips.length === 0) return;
    void runEstimate(seq, p, settingsOf(videoChoice.peek(), r), caps);
  }, ESTIMATE_DEBOUNCE_MS);
}

effect(() => {
  if (!panelOpen.value) return;
  const p = project.value;
  void capabilities.value;
  untracked(() => void refreshCaps(p));
});

effect(() => {
  if (!panelOpen.value) return;
  void project.value;
  void videoChoice.value;
  void resolution.value;
  void sessionCaps.value;
  untracked(scheduleEstimate);
});

// ── The run (CMP-ExportProgress) ─────────────────────────────────────────────────────────────────

export type RunView =
  | { readonly phase: 'running'; readonly fraction: number; readonly remainingMs: number | null }
  | { readonly phase: 'cancelling'; readonly fraction: number }
  | { readonly phase: 'done'; readonly fileName: string; readonly share: File | null }
  | { readonly phase: 'failed' | 'interrupted' | 'no_space' };

/** The export dialog's state (null: no dialog). */
export const run = signal<RunView | null>(null);

let handle: ExportHandle | null = null;
/** The settings of the last start (COPY-action.try_again uses the same). */
let lastSettings: ExportSettings | null = null;
/** The share window keeps the scratch file until the dialog closes (ADR-0010 outcome item 11). */
let heldFile: { readonly url: string; readonly release: () => void } | null = null;

effect(() => {
  const r = run.value;
  editorLocked.value = r !== null && (r.phase === 'running' || r.phase === 'cancelling');
});

const ENDS: Readonly<Record<string, 'failed' | 'interrupted' | 'no_space'>> = {
  'error.export_failed': 'failed',
  'error.export_interrupted': 'interrupted',
  'error.no_space': 'no_space',
};

/**
 * Implements: F-015.R1/R3/R5/R6/R7, RULE-19, SCR-Editor "exporting" — starts the export of the project as it
 * is now with the panel's settings: the editor locks (an open text editor ends first, as one step), the text
 * layers are rasterised at the output size, and CMP-ExportProgress follows the run to its end.
 */
export async function startVideoExport(settings?: ExportSettings): Promise<void> {
  if (editorLocked.peek()) return;
  const caps = sessionCaps.peek();
  const r = resolution.peek();
  const s = settings ?? (r !== null ? settingsOf(videoChoice.peek(), r) : null);
  if (!caps || !s || s.kind !== 'video' || project.peek().clips.length === 0) return;
  if (editingText.peek() !== null) finishEditing();
  playback.peek()?.ctl.pause();
  releaseHeld();
  lastSettings = s;
  panelOpen.value = false;
  estimateSeq++; // any estimate still on its way is dropped
  const p = project.peek();
  const mark = exportMark();
  run.value = { phase: 'running', fraction: 0, remainingMs: null };
  handedOver = null;
  let texts: Texts = {};
  let h: ExportHandle;
  try {
    const { width, height } = outputSize(p, s.resolution);
    texts = await deps.texts(p, width, height);
    const ctx = await deps.context(p, caps, texts);
    if (run.peek()?.phase !== 'running') return closeTexts(texts); // cancelled while getting ready
    h = await deps.start(p, s, ctx);
  } catch {
    closeTexts(texts);
    if (run.peek() !== null) run.value = { phase: 'failed' };
    return;
  }
  handle = h;
  // The scratch file of this run, so the share window can hold it (ADR-0010 outcome item 11).
  handleScratch = h.scratchFile;
  if (run.peek()?.phase !== 'running') void h.cancel(); // Cancel was pressed while it started
  h.onProgress((v) => {
    const now = run.peek();
    if (now?.phase === 'running') run.value = { phase: 'running', fraction: v.fraction, remainingMs: v.remainingMs };
  });
  const result = await h.result;
  closeTexts(texts);
  handle = null;
  finish(result, mark);
}

function finish(result: ExportResult, mark: number): void {
  if (result.ok) {
    // RULE-19, D-018: handed to the browser to save is success; the project as it was at the start counts.
    if (result.fullProject) markExported('video', mark);
    const saved = handedOver?.fileName === result.fileName ? handedOver : null;
    const file = saved ? new File([saved.blob], saved.fileName, { type: mimeOf(saved.fileName) }) : null;
    const share = file && canShareFile(file) ? file : null;
    if (share && saved) holdForShare(saved.url);
    run.value = { phase: 'done', fileName: result.fileName, share };
    return;
  }
  if (result.error === 'cancelled') {
    run.value = null;
    focusOpener();
    return;
  }
  run.value = { phase: ENDS[result.error] ?? 'failed' };
}

/**
 * ADR-0010 outcome item 11: while Share is offered the scratch file is kept (sharing reads the File later
 * than the download); when the dialog closes the 10 s rule starts again from then.
 */
function holdForShare(url: string): void {
  const scratch = handleScratch;
  if (!scratch) return;
  scratch.handedOver(url, deps.now() + HOLD_FOR_SHARE_MS);
  heldFile = { url, release: () => scratch.handedOver(url, deps.now()) };
}
/** The share window's hold: long enough for any share sheet; Close ends it at once. */
export const HOLD_FOR_SHARE_MS = 30 * 60 * 1000;
let handleScratch: { handedOver(url: string | null, at?: number): void } | null = null;

function releaseHeld(): void {
  heldFile?.release();
  heldFile = null;
}

/** Implements: F-015.R3 / AC3, NFR-11 — Cancel (or Esc) while running: stops within 1 s, nothing saved. */
export function cancelExport(): void {
  const r = run.peek();
  if (r?.phase !== 'running') return;
  run.value = { phase: 'cancelling', fraction: r.fraction };
  if (handle) void handle.cancel();
}

/** Closes the dialog after an ending (Close); focus returns to the toolbar's Export. */
export function closeRun(): void {
  const r = run.peek();
  if (!r || r.phase === 'running' || r.phase === 'cancelling') return;
  releaseHeld();
  run.value = null;
  focusOpener();
}

/** COPY-action.change_settings: back to CMP-ExportPanel with the same settings. */
export function changeSettings(): void {
  closeRun();
  openPanel();
}

/** COPY-action.try_again: the same export again (CMP-ExportProgress "interrupted"). */
export function tryAgain(): void {
  const s = lastSettings;
  releaseHeld();
  run.value = null;
  if (s) void startVideoExport(s);
}

/** Implements: F-015.R9 / AC15 — the finished file to the device's share sheet (inside the user's tap). */
export async function shareExport(): Promise<void> {
  const r = run.peek();
  if (r?.phase !== 'done' || !r.share) return;
  try {
    await navigator.share({ files: [r.share] });
  } catch {
    /* dismissed or refused: the download already happened (R9: sharing never replaces it) */
  }
}

/** Test reset of the session state. */
export function resetExportSession(): void {
  panelOpen.value = false;
  videoChoice.value = DEFAULT_CHOICE;
  run.value = null;
  estimateView.value = { status: 'pending' };
  sessionCaps.value = null;
  noFormat.value = false;
  exportGrid.value = null;
  capsFor = null;
  handle = null;
  handedOver = null;
  heldFile = null;
  handleScratch = null;
  lastSettings = null;
}
