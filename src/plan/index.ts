// MOD-Plan — what to draw and play at any project time, pure (specs/40-technical/modules/MOD-Plan.md,
// INV-02). Imports only MOD-Core and no DOM. Preview and export both read these recipes.
import {
  audioEnd,
  frameIndexAt,
  frameStart,
  framesOf,
  layoutOf,
  nearestFrame,
  speedOf,
  textFadeFrames,
  type Clip,
  type Frame,
  type FrameRate,
  type Micros,
  type Project,
  type TextLayer,
} from '../core';

/** Mixing rate of every audio plan (architecture.md A4). */
export const SAMPLE_RATE = 48_000;

/** One main-track clip drawn in a frame. */
export interface ClipLayer {
  readonly clip: Clip;
  /** Source time the frame shows ("Source frames" convention); 0 for a photo. */
  readonly sourceTime: Micros;
  /** Cross-fade blend weight (RULE-10, straight line); the active layers' weights sum to 1. */
  readonly weight: number;
  /** Fade toward the background (RULE-10, straight line): 0 = background only, 1 = clip. */
  readonly opacity: number;
}

export interface TextItem {
  readonly layer: TextLayer;
  /** RULE-10 text fade. */
  readonly opacity: number;
}

/** The recipe for one output frame. */
export interface FramePlan {
  readonly frameIndex: number;
  readonly time: Micros;
  readonly frame: Frame;
  /** Earlier clip first; at most two (inside a cross-fade). */
  readonly layers: readonly ClipLayer[];
  /** Stacking order: later on top (RULE-11). */
  readonly texts: readonly TextItem[];
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Video clip source time at project time t for a clip starting at `start` (RULE-06 speed). */
const sourceTimeAt = (clip: Clip, start: Micros, t: Micros): Micros =>
  clip.kind === 'photo' ? 0 : (clip.in ?? 0) + Math.round(((t - start) * speedOf(clip)) / 100);

/**
 * Implements: F-002.R1, RULE-06 (source time through in point and speed), RULE-10 (cross-fade
 * weights; fades toward the background, not applied where clips are joined by a cross-fade),
 * RULE-11/RULE-10 (visible text and its fade), INV-07 (nothing at or past the project end).
 */
export function framePlan(project: Project, frameIndex: number): FramePlan {
  const rate = project.frame.frameRate;
  const time = frameStart(frameIndex, rate);
  const { spans, frames } = layoutOf(project);
  const plan = { frameIndex, time, frame: project.frame };
  if (frameIndex < 0 || frameIndex >= frames) return { ...plan, layers: [], texts: [] };
  const layers: ClipLayer[] = [];
  project.clips.forEach((clip, i) => {
    const span = spans[i]!;
    if (frameIndex < span.startFrame || frameIndex >= span.endFrame) return;
    const start = frameStart(span.startFrame, rate);
    const end = frameStart(span.endFrame, rate);
    const xfIn = i > 0 ? (spans[i - 1]?.crossFadeFrames ?? 0) : 0;
    const xfOut = span.crossFadeFrames;
    let weight = 1;
    if (xfIn > 0 && frameIndex < span.startFrame + xfIn)
      weight = (time - start) / (frameStart(span.startFrame + xfIn, rate) - start);
    else if (xfOut > 0 && frameIndex >= span.endFrame - xfOut) {
      const from = frameStart(span.endFrame - xfOut, rate);
      weight = 1 - (time - from) / (end - from);
    }
    let opacity = 1;
    if (xfIn === 0 && clip.fadeIn > 0) opacity = Math.min(opacity, (time - start) / clip.fadeIn);
    if (xfOut === 0 && clip.fadeOut > 0) opacity = Math.min(opacity, (end - time) / clip.fadeOut);
    layers.push({
      clip,
      sourceTime: sourceTimeAt(clip, start, time),
      weight: clamp01(weight),
      opacity: clamp01(opacity),
    });
  });
  const texts = project.textLayers
    .filter((t) => t.start <= time && time < t.end)
    .map((layer) => ({ layer, opacity: textOpacity(layer, time, rate) }));
  return { ...plan, layers, texts };
}

function textOpacity(layer: TextLayer, time: Micros, rate: FrameRate): number {
  if (!layer.fade) return 1;
  const fade = frameStart(textFadeFrames(nearestFrame(layer.end, rate) - nearestFrame(layer.start, rate), rate), rate);
  if (fade <= 0) return 1;
  return clamp01(Math.min((time - layer.start) / fade, (layer.end - time) / fade));
}

/** One sound in the mix: a video clip's own sound or an audio clip (RULE-12). */
export interface Voice {
  readonly kind: 'clip' | 'audio';
  readonly id: string;
  readonly sourceId: string;
  /** Timeline sample where the voice starts (48 kHz). */
  readonly startSample: number;
  /** Exclusive; never past the project end (INV-07). */
  readonly endSample: number;
  /** Source time at `startSample`. */
  readonly sourceIn: Micros;
  /** Playback speed (pitch is kept, RULE-06). */
  readonly speed: number;
  /** Linear amplitude: volume ÷ 100, or 0 when muted (RULE-12). */
  readonly gain: number;
  /** Straight-line fades (RULE-10), in samples; 0 when none or replaced by a cross-fade. */
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
  /** Equal-power cross-fades (RULE-10), in samples from the voice's own start / to its end. */
  readonly crossInSamples: number;
  readonly crossOutSamples: number;
  /** The voice's full end before the project end limited it. */
  readonly naturalEndSample: number;
}

/** The recipe for a block of 48 kHz sound. */
export interface AudioPlan {
  readonly fromSample: number;
  readonly count: number;
  readonly voices: readonly Voice[];
}

const framesToSamples = (frames: number, rate: FrameRate): number => (frames * SAMPLE_RATE) / rate;
const microsToSamples = (t: Micros): number => Math.round((t * SAMPLE_RATE) / 1_000_000);

/** All voices of the project (independent of the block). */
export function voices(project: Project): Voice[] {
  const rate = project.frame.frameRate;
  const { spans, frames } = layoutOf(project);
  const endSample = framesToSamples(frames, rate);
  const out: Voice[] = [];
  project.clips.forEach((clip, i) => {
    if (clip.kind !== 'video') return;
    const span = spans[i]!;
    const xfIn = i > 0 ? (spans[i - 1]?.crossFadeFrames ?? 0) : 0;
    const xfOut = span.crossFadeFrames;
    const natural = framesToSamples(span.endFrame, rate);
    out.push({
      kind: 'clip',
      id: clip.id,
      sourceId: clip.sourceId,
      startSample: framesToSamples(span.startFrame, rate),
      endSample: Math.min(natural, endSample),
      naturalEndSample: natural,
      sourceIn: clip.in ?? 0,
      speed: speedOf(clip) / 100,
      gain: clip.muted ? 0 : (clip.volume ?? 100) / 100,
      fadeInSamples: xfIn ? 0 : framesToSamples(framesOf(clip.fadeIn, rate), rate),
      fadeOutSamples: xfOut ? 0 : framesToSamples(framesOf(clip.fadeOut, rate), rate),
      crossInSamples: framesToSamples(xfIn, rate),
      crossOutSamples: framesToSamples(xfOut, rate),
    });
  });
  for (const a of project.audioClips) {
    const start = framesToSamples(nearestFrame(a.start, rate), rate);
    const natural = start + microsToSamples(audioEnd(a) - a.start);
    if (start >= endSample) continue;
    out.push({
      kind: 'audio',
      id: a.id,
      sourceId: a.sourceId,
      startSample: start,
      endSample: Math.min(natural, endSample),
      naturalEndSample: natural,
      sourceIn: a.in,
      speed: 1,
      gain: a.muted ? 0 : a.volume / 100,
      fadeInSamples: microsToSamples(a.fadeIn),
      fadeOutSamples: microsToSamples(a.fadeOut),
      crossInSamples: 0,
      crossOutSamples: 0,
    });
  }
  return out;
}

/**
 * Implements: F-011.R5 mix recipe — the voices sounding in [fromSample, fromSample + count), with
 * RULE-12 gains, RULE-10 straight-line fades and equal-power cross-fades; nothing past the end (INV-07).
 */
export function audioPlan(project: Project, fromSample: number, count: number): AudioPlan {
  const to = fromSample + count;
  return {
    fromSample,
    count,
    voices: voices(project).filter((v) => v.startSample < to && v.endSample > fromSample),
  };
}

/** The gain of a voice at a timeline sample: volume × fades × cross-fade curve. */
export function voiceGain(v: Voice, sample: number): number {
  if (sample < v.startSample || sample >= v.endSample || v.gain === 0) return 0;
  const fromStart = sample - v.startSample;
  const toEnd = v.naturalEndSample - sample;
  let g = v.gain;
  if (v.fadeInSamples > 0 && fromStart < v.fadeInSamples) g *= fromStart / v.fadeInSamples;
  if (v.fadeOutSamples > 0 && toEnd < v.fadeOutSamples) g *= toEnd / v.fadeOutSamples;
  if (v.crossInSamples > 0 && fromStart < v.crossInSamples)
    g *= Math.sin((Math.PI / 2) * (fromStart / v.crossInSamples));
  if (v.crossOutSamples > 0 && toEnd <= v.crossOutSamples) g *= Math.sin((Math.PI / 2) * (toEnd / v.crossOutSamples));
  return g;
}

/** The source time a voice plays at a timeline sample (RULE-06: speed, pitch kept by MOD-Audio). */
export function voiceSourceTime(v: Voice, sample: number): Micros {
  return v.sourceIn + Math.round(((sample - v.startSample) * v.speed * 1_000_000) / SAMPLE_RATE);
}

/** The GIF's own timing (RULE-16): its first project time and its frame rate. */
export interface GifTiming {
  readonly from: Micros;
  readonly rate: number;
}

/**
 * Implements: RULE-16 GIF frames, NFR-08 (GIF) — GIF frame i shows the project at time
 * from + round(i × 1,000,000 ÷ rate): the frame plan of the project frame whose interval holds that time,
 * the same picture the preview shows there.
 */
export function gifFramePlan(project: Project, settings: GifTiming, i: number): FramePlan {
  const t = settings.from + Math.round((i * 1_000_000) / settings.rate);
  return framePlan(project, frameIndexAt(t, project.frame.frameRate));
}

/**
 * Implements: RULE-09 *Thumbnails*, F-008.R1 — the recipe of a look-gallery thumbnail: the selected clip
 * alone (no other clip, no text; fully shown, as no cross-fade or fade dims it) at the playhead frame when
 * the playhead is inside the clip, otherwise at the clip's first frame; with the clip's adjustments and
 * placement in the project's frame, and the look `lookId` at intensity 100 (null: None; left out: the
 * clip's own look). Null when the clip is not on the main track.
 */
export function thumbnailPlan(
  project: Project,
  clipId: string,
  playhead: Micros,
  lookId?: string | null,
): FramePlan | null {
  const i = project.clips.findIndex((c) => c.id === clipId);
  const span = layoutOf(project).spans[i];
  if (i < 0 || !span) return null;
  const k = frameIndexAt(Math.max(0, playhead), project.frame.frameRate);
  const frameIndex = k >= span.startFrame && k < span.endFrame ? k : span.startFrame;
  const plan = framePlan(project, frameIndex);
  const layer = plan.layers.find((l) => l.clip.id === clipId);
  if (!layer) return null;
  const look = lookId === undefined ? layer.clip.look : lookId === null ? null : { id: lookId, intensity: 100 };
  return {
    ...plan,
    layers: [{ ...layer, clip: { ...layer.clip, look }, weight: 1, opacity: 1 }],
    texts: [],
  };
}
