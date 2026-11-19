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
// F-016 adds the GIF and Audio only kinds (RULE-16): the GIF's range (defaulting from the playhead when GIF is
// picked), size and rate, and the audio format; both run through the same dialog, cancel, failure handling,
// Share and scratch clean-up (F-016.R3). A GIF export never clears unexported changes (RULE-19, D-019).
// Implements: F-015.R1–R3, F-015.R5–R7, F-015.R9, F-016.R1–R4, RULE-15 (offers, default, size target), RULE-16,
// RULE-19 (signal), RULE-23 (settings kept for the session), D-018, D-019, D-020, CMP-ExportPanel "Behavior",
// CMP-ExportProgress "Behavior".
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
  type AudioFormat,
  type Capabilities,
  type GridCell,
  type VideoCodecId,
  type VideoTrial,
} from '../codec';
import { formatDuration, type Language } from '../copy';
import {
  frameAspect,
  frameAtOrAfter,
  frameIndexAt,
  frameStart,
  gifOutputSize,
  minDuration,
  projectFrames,
  videoOutputSize,
  type EngineMedia,
  type ExportQuality,
  type ExportSettings,
  type FrameRate,
  type Micros,
  type Project,
  type TextBitmap,
  type VideoResolution,
} from '../core';
import { deviceClass, platformHints } from '../engine';
import {
  downloadBlob,
  estimate as estimateExport,
  GIF_MAX_US,
  hasSound,
  start as startExportRun,
  type EstimateResult,
  type ExportCaps,
  type ExportContext,
  type ExportHandle,
  type ExportResult,
} from '../export';
import { canShareFile } from '../host';
import { markExported, exportMark, playhead, project } from '../project';
import { textBitmaps } from '../preview';
import { needsClip } from './adding';
import { capabilities } from './device';
import { editorLocked } from './lock';
import { lookTables } from './looks';
import { musicFailed, musicIds, playback, registryMedia } from './playback';
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
  /** The reachability check failed or gave no answer: Export waits, with a reason and a retry. */
  | { readonly kind: 'unknown' }
  | { readonly kind: 'lower_res'; readonly fit: VideoResolution }
  | { readonly kind: 'unreachable'; readonly min: number };

/** Implements: F-015.R2 / AC2 — the advice of an estimate: a lower resolution, or the smallest whole-MB target. */
export function targetAdvice(e: EstimateResult | 'failed' | null): TargetAdvice {
  if (e === 'failed') return { kind: 'unknown' };
  if (!e || e.reachable) return { kind: 'none' };
  if (e.suggestedResolution) return { kind: 'lower_res', fit: e.suggestedResolution };
  if (e.smallestTargetMB) return { kind: 'unreachable', min: e.smallestTargetMB };
  return { kind: 'unknown' };
}

const MIME: Readonly<Record<string, string>> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  gif: 'image/gif',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};
/** The MIME type of a finished file, for the File given to the share sheet (RULE-15, RULE-16 formats). */
export const mimeOf = (fileName: string): string =>
  MIME[/\.(\w+)$/.exec(fileName)?.[1] ?? ''] ?? 'application/octet-stream';

// ── RULE-16 GIF and audio-only choices (pure) ──────────────────────────────────────────────────────

export type ExportKind = ExportSettings['kind'];
/** The kind tabs, in order (CMP-ExportPanel anatomy). */
export const KINDS: readonly ExportKind[] = ['video', 'gif', 'audio'];
export type GifSize = 320 | 480 | 640;
export type GifRate = 10 | 15;
/** RULE-16: 320, 480 or 640 pixels on the longer side. */
export const GIF_SIZES: readonly GifSize[] = [320, 480, 640];
/** RULE-16: 10 or 15 frames per second. */
export const GIF_RATES: readonly GifRate[] = [10, 15];
export interface GifChoice {
  readonly size: GifSize;
  readonly rate: GifRate;
}
/** RULE-16 defaults: 480 and 15 fps. */
export const DEFAULT_GIF: GifChoice = { size: 480, rate: 15 };
export interface GifRange {
  readonly from: Micros;
  readonly to: Micros;
}

/**
 * Implements: RULE-16 GIF range, F-016.AC1 — a project of 15 s or less is exported whole; otherwise the 15 s
 * from the frame the playhead is in, or the last 15 s when fewer than 15 s remain.
 */
export function defaultGifRange(length: Micros, at: Micros, rate: FrameRate): GifRange {
  if (length <= GIF_MAX_US) return { from: 0, to: length };
  const last = frameStart(frameAtOrAfter(length - GIF_MAX_US, rate), rate);
  const from = Math.min(frameStart(frameIndexAt(Math.max(0, at), rate), rate), last);
  return { from, to: Math.min(length, from + GIF_MAX_US) };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Implements: RULE-16, CMP-ExportPanel "Behavior" (GIF range) — a new start: the end follows only as far as
 * needed to keep the range within 15 s, inside the project and at least RULE-05's minimum length.
 */
export function setGifFrom(r: GifRange, from: Micros, length: Micros, rate: FrameRate): GifRange {
  if (length <= GIF_MAX_US) return { from: 0, to: length };
  const min = minDuration(rate);
  const f = clamp(from, 0, length - min);
  return { from: f, to: clamp(r.to, f + min, Math.min(length, f + GIF_MAX_US)) };
}

/** Implements: RULE-16 — a new end: the start follows only as far as needed (as `setGifFrom`). */
export function setGifTo(r: GifRange, to: Micros, length: Micros, rate: FrameRate): GifRange {
  if (length <= GIF_MAX_US) return { from: 0, to: length };
  const min = minDuration(rate);
  const t = clamp(to, min, length);
  return { from: clamp(r.from, Math.max(0, t - GIF_MAX_US), t - min), to: t };
}

/** RULE-16: a range kept within the project as it is now (the project may change while the panel is open). */
export const clampGifRange = (r: GifRange, length: Micros, rate: FrameRate): GifRange =>
  setGifFrom(r, r.from, length, rate);

/**
 * CMP-ExportPanel "gif": From/To accept m:ss with optional frames after "·", "." or ":" (the transport shows
 * "0:10 ·15"), or whole seconds; the time is that frame's start at the project's rate. Null when not a time.
 */
export function parseGifTime(text: string, rate: FrameRate): Micros | null {
  const m = /^\s*(?:(\d{1,2}):)?(\d{1,2})(?:\s*[·.:]\s*(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0);
  const seconds = Number(m[2]);
  const frame = Number(m[3] ?? 0);
  if (seconds >= 60 || frame >= rate) return null;
  return frameStart((minutes * 60 + seconds) * rate + frame, rate);
}

/** A GIF range time as m:ss, with the frame inside that second as a "·ff" suffix when it isn't 0. */
export function formatGifTime(t: Micros, rate: FrameRate, lang: Language): string {
  const k = frameIndexAt(Math.max(0, t), rate);
  const second = Math.floor(k / rate);
  const frame = k - second * rate;
  const time = formatDuration(second * 1_000_000, lang);
  return frame === 0 ? time : `${time}·${String(frame).padStart(2, '0')}`;
}

/** The audio-only format choice (RULE-16): the compressed format the device can encode, or WAV. */
export type AudioChoice = 'compressed' | 'wav';
const WAV: AudioFormat = { id: 'wav', fallback: false };

// ── The session's export capability record (ADR-0004 outcome) ───────────────────────────────────

/** Trial encodes once per codec per session; a codec whose trial fails is dropped for the session. */
const videoTrials = new Map<VideoCodecId, Promise<VideoTrial>>();
let audioTrials: Promise<ExportCaps['audio']> | null = null;
const grids = new Map<VideoCodecId, Promise<GridCell[] | null>>();

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
 * MOD-Codec), with the trial's latency mode, acceleration and bitrate modes. The audio-only compressed format
 * follows the sound trials too (RULE-16). When no video format works (`videoFormat` null), the GIF and WAV
 * exports, which need no video or sound encoder, stay available (F-023.R5).
 */
export async function exportCaps(caps: Capabilities, sound: boolean): Promise<ExportCaps> {
  // A sound encoder whose trial failed leaves the formats that need it out (RULE-22, F-023.R5).
  const audio = sound ? await soundTrials(caps) : {};
  const failed = new Set<VideoCodecId>();
  for (;;) {
    const usable = {
      ...caps,
      encode: { ...caps.encode },
      audioEncode: sound ? { aac: !!audio.aac, opus: !!audio.opus } : caps.audioEncode,
    };
    for (const c of failed) usable.encode[c] = false;
    const f = chooseVideoFormat(usable, sound);
    if (!f) return capsOf(null, usable, null, audio);
    const trial = await videoTrial(f.video).catch(() => null);
    if (trial?.ok) return capsOf(f, usable, trial, audio);
    failed.add(f.video);
  }
}

function capsOf(
  f: ReturnType<typeof chooseVideoFormat>,
  caps: Pick<Capabilities, 'audioEncode'>,
  trial: VideoTrial | null,
  audio: ExportCaps['audio'],
): ExportCaps {
  return {
    videoFormat: f,
    audioFormat: chooseAudioFormat(caps),
    video: {
      latencyMode: trial?.latencyMode ?? 'realtime',
      acceleration: trial?.acceleration ?? 'no-preference',
      bitrateModes: trial?.bitrateModes ?? [],
    },
    audio,
  };
}

/** The size × rate grid of a codec, probed once per session when the panel first needs it (ADR-0004). */
const gridOf = (codec: VideoCodecId): Promise<GridCell[] | null> => {
  let p = grids.get(codec);
  if (!p) {
    // A probe that fails leaves the start-up answer standing (null), never "nothing can be encoded".
    p = probeExportGrid(codec).catch(() => null);
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
/** Whether `sessionCaps` was worked out for a project with sound (null: not yet). */
export const capsSound = signal<boolean | null>(null);
/** The capability record matches the project's sound now (sound added while the panel is open waits). */
export const capsReady = computed(() => sessionCaps.value !== null && capsSound.value === hasSound(project.value));
/** No video format works on this device after the trial encodes (RULE-22 left the editor open). */
export const noFormat = signal(false);
/** The grid of the chosen codec (null until probed). */
export const exportGrid = signal<readonly GridCell[] | null>(null);

/** RULE-15: the sizes the panel offers for the session's project. */
export const offers = computed(() => {
  const caps = capabilities.value;
  // No format works after the trial encodes: every size reads COPY-export.res_no_encoder (PRN-07).
  const encodes = caps && !noFormat.value ? Object.values(caps.encode).some(Boolean) : false;
  return resolutionOffers(project.value, encodes, noFormat.value ? null : exportGrid.value);
});
export const resolution = computed(() => chosenResolution(videoChoice.value, offers.value));

export type EstimateView =
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly result: EstimateResult }
  | { readonly status: 'failed' };
/** The panel's estimate for the current settings (COPY-export.estimate, F-015.R2). */
export const estimateView = signal<EstimateView>({ status: 'pending' });

/** The chosen kind tab (ENT-ExportSettings: kept for the session and across new projects, RULE-23). */
export const exportKind = signal<ExportKind>('video');
/** The session's GIF size and rate (RULE-16, RULE-23). */
export const gifChoice = signal<GifChoice>(DEFAULT_GIF);
/** The range of this opening of the panel: set from the playhead when GIF is picked (RULE-16). */
const gifPicked = signal<GifRange | null>(null);
/** The project's length (µs) and frame rate. */
const lengthNow = computed(() => frameStart(projectFrames(project.value), project.value.frame.frameRate));
/** The GIF range as offered: the one picked, kept within the project as it is now (RULE-16). */
export const gifRange = computed<GifRange>(() => {
  const rate = project.value.frame.frameRate;
  const length = lengthNow.value;
  return clampGifRange(gifPicked.value ?? defaultGifRange(length, 0, rate), length, rate);
});
/** RULE-16: a project of 15 s or less is exported whole; both fields are read-only (CMP-ExportPanel). */
export const gifRangeFixed = computed(() => lengthNow.value <= GIF_MAX_US);
/** The session's audio-only format choice (RULE-16; compressed by default). */
export const audioChoice = signal<AudioChoice>('compressed');
/**
 * Implements: RULE-16, F-023.R5 / AC8 — the audio-only formats offered: the compressed one the device can
 * encode (after the sound trial encodes, once known), and WAV always; without a sound encoder, WAV only.
 */
export const audioOffers = computed<readonly AudioFormat[]>(() => {
  const ec = sessionCaps.value;
  if (ec && capsSound.value) return ec.audioFormat.id === 'wav' ? [WAV] : [ec.audioFormat, WAV];
  const caps = capabilities.value;
  return caps ? audioFormatOffers(caps) : [WAV];
});
/** The audio choice in effect: WAV when no compressed format is offered. */
export const chosenAudio = computed<AudioChoice>(() => (audioOffers.value.length > 1 ? audioChoice.value : 'wav'));

/** The settings the panel would export now (null: no resolution can be offered for a video). */
export const exportSettings = computed<ExportSettings | null>(() => {
  const kind = exportKind.value;
  if (kind === 'gif') {
    const { size, rate } = gifChoice.value;
    const { from, to } = gifRange.value;
    return { kind: 'gif', size, rate, from, to };
  }
  if (kind === 'audio') return { kind: 'audio', format: chosenAudio.value };
  const r = resolution.value;
  return r === null ? null : settingsOf(videoChoice.value, r);
});

/**
 * Why Export is unavailable for every setting of the kind (CMP-ExportPanel "needs clip", "no sound"): an empty
 * main track (RULE-03), or, for audio only, no unmuted, non-silent sound (RULE-16). Null: neither.
 */
export const exportBlock = computed<'needs_clip' | 'no_sound' | null>(() => {
  if (needsClip.value) return 'needs_clip';
  if (exportKind.value === 'audio' && !hasSound(project.value)) return 'no_sound';
  return null;
});

/**
 * Implements: CMP-ExportPanel "Behavior" — Export is possible when there is a clip (RULE-03) and the capability
 * record for the project's sound is known; for a video, a format and a resolution, and a size target known to
 * be reachable at the chosen size; for audio only, sound to export (RULE-16).
 */
export const canExport = computed(() => {
  if (exportBlock.value !== null || !capsReady.value || exportSettings.value === null) return false;
  if (exportKind.value !== 'video') return true;
  if (noFormat.value) return false;
  if (videoChoice.value.targetMB === null) return true;
  const e = estimateView.value;
  return e.status === 'ready' && e.result.reachable;
});

/** Picks a kind tab; GIF's range starts from the playhead the first time it is picked in this opening. */
export function chooseKind(kind: ExportKind): void {
  exportKind.value = kind;
  if (kind === 'gif' && gifPicked.peek() === null) pickDefaultRange();
}
function pickDefaultRange(): void {
  const p = project.peek();
  gifPicked.value = defaultGifRange(lengthNow.peek(), playhead.peek(), p.frame.frameRate);
}
export function chooseGifSize(size: GifSize): void {
  gifChoice.value = { ...gifChoice.value, size };
}
export function chooseGifRate(rate: GifRate): void {
  gifChoice.value = { ...gifChoice.value, rate };
}
/** A From typed in the panel (RULE-16: the end follows within 15 s). */
export function chooseGifFrom(from: Micros): void {
  const p = project.peek();
  gifPicked.value = setGifFrom(gifRange.peek(), from, lengthNow.peek(), p.frame.frameRate);
}
/** A To typed in the panel (RULE-16: the start follows within 15 s). */
export function chooseGifTo(to: Micros): void {
  const p = project.peek();
  gifPicked.value = setGifTo(gifRange.peek(), to, lengthNow.peek(), p.frame.frameRate);
}
export function chooseAudio(choice: AudioChoice): void {
  audioChoice.value = choice;
}

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
/** Focus back on the toolbar's Export (the panel's close; the progress dialog's, once it has closed). */
export const focusOpener = (): void => {
  if (opener?.isConnected) opener.focus();
};

/** Opens CMP-ExportPanel (COPY-action.export; Mod+E with F-017). `keepRange`: Change settings. */
export function openPanel(keepRange = false): void {
  if (editorLocked.peek()) return;
  // Only one panel at a time: a running playback keeps going, an open text editor ends (one step).
  if (editingText.peek() !== null) finishEditing();
  // RULE-16: the GIF range is worked out from the playhead for each opening (its size and rate are kept);
  // Change settings comes back to the range that was exported.
  if (!keepRange || gifPicked.peek() === null) {
    gifPicked.value = null;
    if (exportKind.peek() === 'gif') pickDefaultRange();
  }
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

/** A bundled track's file could not be read: the export stops with COPY-notice.music_unavailable (Q120). */
export class MusicUnavailable extends Error {
  constructor(readonly trackId: string) {
    super(`NotReadableError: bundled track ${trackId} could not be read`);
  }
}

/**
 * Every source's file or picture (MOD-Media's registry) and the bundled tracks the audio clips play. A track
 * that can't be read shows COPY-notice.music_unavailable (F-011.R7) and fails the export: it is never
 * exported without the track (build question 120; the proposed rule is question 190).
 */
export async function mediaOf(p: Project): Promise<EngineMedia[]> {
  const sources = await Promise.all(p.sources.map((src) => registryMedia(src)));
  const music: EngineMedia[] = [];
  for (const id of musicIds(p, null)) {
    try {
      music.push({ id, kind: 'audio', file: await deps.music(id) });
    } catch {
      musicFailed(id);
      throw new MusicUnavailable(id);
    }
  }
  return [...sources.filter((m): m is EngineMedia => m !== null), ...music];
}

type Texts = Readonly<Record<string, TextBitmap>>;
const closeTexts = (t: Texts): void => {
  for (const b of Object.values(t)) b.bitmap.close();
};

/**
 * The picture size an export draws its text layers at (Q170): a video's output size (RULE-15, ADR-0010 outcome
 * item 9) or a GIF's (RULE-16); null for audio only, which draws nothing.
 */
const drawnSize = (p: Project, s: ExportSettings): { width: number; height: number } | null =>
  s.kind === 'video'
    ? videoOutputSize(frameAspect(p), s.resolution)
    : s.kind === 'gif'
      ? gifOutputSize(frameAspect(p), s.size)
      : null;

/** Test seam: what the export does besides MOD-Export (the app passes none; unit tests fake it). */
export interface ExportDeps {
  readonly estimate: typeof estimateExport;
  readonly start: typeof startExportRun;
  readonly context: (p: Project, caps: ExportCaps, texts: Texts) => Promise<ExportContext>;
  readonly texts: (p: Project, width: number, height: number) => Promise<Texts>;
  readonly now: () => number;
  /** The capability record for a project with or without sound (`exportCaps`). */
  readonly caps: (caps: Capabilities, sound: boolean) => Promise<ExportCaps | null>;
  /** The size × rate grid of a codec (null: unknown, the start-up answer stands). */
  readonly grid: (codec: VideoCodecId) => Promise<GridCell[] | null>;
  /** A bundled track's packaged file (MOD-Assets). */
  readonly music: (trackId: string) => Promise<Blob>;
}

/** The browser's context of an export (tests reach `mediaOf` through it with a faked `music`). */
export async function browserContext(p: Project, caps: ExportCaps, texts: Texts): Promise<ExportContext> {
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
  };
}

let deps: ExportDeps = {
  estimate: estimateExport,
  start: startExportRun,
  context: browserContext,
  texts: (p, w, h) => textBitmaps(p.textLayers, w, h),
  now: () => Date.now(),
  music: musicBlob,
  caps: exportCaps,
  grid: (codec) => gridOf(codec),
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
  // Review: the record of the old sound state never serves the new one (a format without a sound track).
  sessionCaps.value = null;
  capsSound.value = null;
  const ec = await deps.caps(caps, sound);
  if (capsFor.caps !== caps || capsFor.sound !== sound) return;
  sessionCaps.value = ec;
  capsSound.value = sound;
  noFormat.value = ec === null || ec.videoFormat === null; // F-023.R5: GIF and WAV stay
  if (ec?.videoFormat) exportGrid.value = await deps.grid(ec.videoFormat.video);
}

/** The estimate is worked out again this long after the last change (CMP-ExportPanel: "as soon as"). */
export const ESTIMATE_DEBOUNCE_MS = 200;
let estimateSeq = 0;
let estimateTimer: ReturnType<typeof setTimeout> | null = null;

/** Implements: F-015.R2, CMP-ExportPanel "Behavior" — the estimate and the target's advice follow every change. */
async function runEstimate(seq: number, p: Project, settings: ExportSettings, caps: ExportCaps): Promise<void> {
  let texts: Texts = {};
  try {
    const size = drawnSize(p, settings);
    if (size) texts = await deps.texts(p, size.width, size.height);
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

/** COPY-action.try_again beside an unknown size-target answer: the estimate is worked out again. */
export function retryEstimate(): void {
  scheduleEstimate();
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
    const s = exportSettings.peek();
    if (!panelOpen.peek() || !caps || s === null || exportBlock.peek() !== null) return;
    void runEstimate(seq, p, s, caps);
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
  void exportSettings.value;
  void sessionCaps.value;
  untracked(scheduleEstimate);
});

// ── The run (CMP-ExportProgress) ─────────────────────────────────────────────────────────────────

export type RunView =
  | { readonly phase: 'running'; readonly fraction: number; readonly remainingMs: number | null }
  | { readonly phase: 'cancelling'; readonly fraction: number }
  | { readonly phase: 'done'; readonly fileName: string; readonly share: File | null }
  | { readonly phase: 'failed'; readonly reason?: 'music' }
  | { readonly phase: 'interrupted' | 'no_space' };

/** The export dialog's state (null: no dialog). */
export const run = signal<RunView | null>(null);

let handle: ExportHandle | null = null;
/**
 * Each start takes a token; a cancel before MOD-Export's handle exists, a Try again or a reset makes it stale,
 * and a stale run stops at its next step (closing its text bitmaps, cancelling a handle that arrived late).
 */
let runToken = 0;
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
 * Implements: F-015.R1/R3/R5/R6/R7, F-016.R1–R3, RULE-19, SCR-Editor "exporting" — starts the export of the
 * project as it is now with the panel's settings (or `settings`): the editor locks (an open text editor ends
 * first, as one step), the text layers are rasterised at the output size (none for audio only), and
 * CMP-ExportProgress follows the run to its end.
 */
export async function startExport(settings?: ExportSettings): Promise<void> {
  if (editorLocked.peek()) return;
  const caps = capsReady.peek() ? sessionCaps.peek() : null;
  const s = settings ?? exportSettings.peek();
  const p0 = project.peek();
  if (!caps || !s || p0.clips.length === 0) return;
  // RULE-16: audio only needs unmuted, non-silent sound (the panel says so; nothing starts).
  if (s.kind === 'audio' && !hasSound(p0)) return;
  if (editingText.peek() !== null) finishEditing();
  playback.peek()?.ctl.pause();
  releaseHeld();
  lastSettings = s;
  panelOpen.value = false;
  estimateSeq++; // any estimate still on its way is dropped
  const token = ++runToken;
  const stale = (): boolean => token !== runToken;
  const p = project.peek();
  const mark = exportMark();
  run.value = { phase: 'running', fraction: 0, remainingMs: null };
  handedOver = null;
  let texts: Texts = {};
  let h: ExportHandle;
  try {
    const size = drawnSize(p, s);
    if (size) texts = await deps.texts(p, size.width, size.height);
    if (stale()) return closeTexts(texts);
    const base = await deps.context(p, caps, texts);
    if (stale()) return closeTexts(texts);
    // The hand-over (RULE-15, D-018: a `blob:` URL clicked through `<a download>`), noted for Share (R9).
    const ctx: ExportContext = {
      ...base,
      save: (blob, fileName) => {
        const url = (base.save ?? downloadBlob)(blob, fileName);
        if (!stale()) handedOver = { blob, fileName, url };
        return url;
      },
    };
    h = await deps.start(p, s, ctx);
  } catch (e) {
    closeTexts(texts);
    // A cancelled run ends quietly; a bundled track that can't be read says so (build question 120).
    if (!stale())
      run.value = e instanceof MusicUnavailable ? { phase: 'failed', reason: 'music' } : { phase: 'failed' };
    return;
  }
  // MOD-Export has posted the bitmaps to its worker (structured clones): ours are no longer needed.
  closeTexts(texts);
  if (stale()) {
    void h.cancel(); // Cancel was pressed while it started
    return;
  }
  handle = h;
  // The scratch file of this run, so the share window can hold it (ADR-0010 outcome item 11).
  handleScratch = h.scratchFile;
  h.onProgress((v) => {
    if (!stale() && run.peek()?.phase === 'running')
      run.value = { phase: 'running', fraction: v.fraction, remainingMs: v.remainingMs };
  });
  const result = await h.result;
  if (handle === h) handle = null;
  if (stale()) return;
  finish(result, mark, s.kind);
}

function finish(result: ExportResult, mark: number, kind: ExportKind): void {
  if (result.ok) {
    // RULE-19, D-018, D-019: handed to the browser is success; the project as it was at the start counts (a
    // video or audio export; a GIF never clears unexported changes).
    if (result.fullProject) markExported(kind, mark);
    const saved = handedOver?.fileName === result.fileName ? handedOver : null;
    const file = saved ? new File([saved.blob], saved.fileName, { type: mimeOf(saved.fileName) }) : null;
    const share = file && canShareFile(file) ? file : null;
    if (share && saved) holdForShare(saved.url);
    handedOver = null; // the Blob is kept only through the share File, and only while Share is offered
    run.value = { phase: 'done', fileName: result.fileName, share };
    return;
  }
  if (result.error === 'cancelled') {
    run.value = null; // the dialog closes and gives focus back to the toolbar's Export
    return;
  }
  run.value = { phase: ENDS[result.error] ?? 'failed' };
}

/**
 * ADR-0010 outcome item 11: while Share is offered the scratch file is kept (sharing reads the File later
 * than the download); when the dialog closes, the share sheet settles or the page is hidden, the 10 s rule
 * starts again from then.
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

/**
 * Security audit L1: a held file must not outlive the page. On `pagehide` the hold ends and MOD-Scratch's
 * best-effort clean-up starts (ADR-0010 outcome item 6); what it can't finish, the next start-up sweeps.
 */
export function onPageHide(): void {
  releaseHeld();
  void scratchReady?.then((sc) => sc.pagehide()).catch(() => undefined);
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
  window.addEventListener('pagehide', onPageHide);

/** Implements: F-015.R3 / AC3, NFR-11 — Cancel (or Esc) while running: stops within 1 s, nothing saved. */
export function cancelExport(): void {
  const r = run.peek();
  if (r?.phase !== 'running') return;
  if (!handle) {
    // Still getting ready (text, media, MOD-Export's start): nothing runs yet, so it ends now.
    runToken++;
    run.value = null;
    return;
  }
  run.value = { phase: 'cancelling', fraction: r.fraction };
  void handle.cancel();
}

/** Closes the dialog after an ending (Close); focus returns to the toolbar's Export. */
export function closeRun(): void {
  const r = run.peek();
  if (!r || r.phase === 'running' || r.phase === 'cancelling') return;
  releaseHeld();
  handedOver = null;
  run.value = null;
}

/** COPY-action.change_settings: back to CMP-ExportPanel with the same settings. */
export function changeSettings(): void {
  closeRun();
  openPanel(true);
}

/** COPY-action.try_again: the same export again (CMP-ExportProgress "interrupted"). */
export function tryAgain(): void {
  const s = lastSettings;
  releaseHeld();
  handedOver = null;
  runToken++;
  run.value = null;
  if (s) void startExport(s);
}

/** Implements: F-015.R9 / AC15 — the finished file to the device's share sheet (inside the user's tap). */
export async function shareExport(): Promise<void> {
  const r = run.peek();
  if (r?.phase !== 'done' || !r.share) return;
  try {
    await navigator.share({ files: [r.share] });
  } catch {
    /* dismissed or refused: the download already happened (R9: sharing never replaces it) */
  } finally {
    releaseHeld(); // security audit L1: the hold ends once the share sheet has taken the file or closed
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
  runToken++;
  capsSound.value = null;
  handedOver = null;
  heldFile = null;
  handleScratch = null;
  lastSettings = null;
  exportKind.value = 'video';
  gifChoice.value = DEFAULT_GIF;
  gifPicked.value = null;
  audioChoice.value = 'compressed';
}

/** The video export of the panel or of `settings` (F-015's name for `startExport`). */
export const startVideoExport = startExport;
