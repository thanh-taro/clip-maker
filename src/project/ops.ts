// MOD-Project — every edit as a pure operation on the frozen document, built from MOD-Core's rule
// maths (ADR-0011 §1–2). Each returns { project, notices, changed }: the same project object when
// nothing changes (no undo step, RULE-13), notices as COPY IDs, and the IDs of the items the step
// changed (selected after undo or redo, RULE-13).
import {
  DEFAULT_PLACEMENT,
  RULE_04,
  RULE_05,
  RULE_06,
  RULE_02,
  RULE_11,
  RULE_12,
  TEXT_DEFAULTS,
  contrastOf,
  audioEnd,
  clampAdjustments,
  clampLook,
  clampPlacement,
  clampText,
  clipFrames,
  crossFadeLimit,
  fitClipFrames,
  fitAudioFades,
  frameIndexAt,
  frameStart,
  framesOf,
  isBlankText,
  isTooShort,
  maxAudioFadeFrames,
  layoutClips,
  maxClipFadeFrames,
  maxProjectFrames,
  minCrossFadeFrames,
  minDuration,
  retimeAudio,
  retimeClip,
  minFrames,
  moveTarget,
  nearestFrame,
  newTextFrames,
  normaliseClips,
  pickedFrames,
  placeNewAudio,
  projectEnd,
  projectFrames,
  rangeForFrames,
  secondsToFrames,
  snapToFrame,
  sourceEnd,
  speedFor,
  speedOf,
  splitClip,
  trimAudioClip,
  normaliseColourTools,
  normaliseHex,
  duotoneStart,
  fromStatus,
  REPLACE_MAX,
  REPLACE_RANGE,
  REPLACE_SOFTNESS,
  type ReplacementValues,
  type Adjustments,
  type AdjustmentName,
  type AudioClip,
  type Clip,
  type ColourRangeName,
  type ColourTools,
  type DuotoneChoice,
  type MixerRange,
  type Pop,
  type SplitToning,
  type Frame,
  type FrameRate,
  type Look,
  type Micros,
  type Notice,
  type Placement,
  type Project,
  type Source,
  type TextLayer,
  type TrackContext,
} from '../core';

export interface EditResult {
  readonly project: Project;
  readonly notices: readonly Notice[];
  /** IDs of the items this step changed (RULE-13 selection after undo/redo). */
  readonly changed: readonly string[];
}

/** A clip's adjustments, colour tools and look, as copied, pasted and applied to all (RULE-08, RULE-24). */
export interface Grade {
  readonly adjustments: Adjustments;
  readonly look: Look;
  /** RULE-24 (absent: every colour tool at default). */
  readonly colourTools?: ColourTools;
}

export type NextId = () => string;

// ── helpers ────────────────────────────────────────────────────────────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const unique = (xs: readonly Notice[]): Notice[] => [...new Set(xs)];
const same = (p: Project, notices: readonly Notice[] = []): EditResult => ({ project: p, notices, changed: [] });
const result = (p: Project, next: Project, changed: readonly string[], notices: readonly Notice[] = []): EditResult =>
  next === p ? same(p, notices) : { project: deepFreeze(next), notices: unique(notices), changed };

const rateOf = (p: Project): FrameRate => p.frame.frameRate;
const clipIndex = (p: Project, id: string): number => p.clips.findIndex((c) => c.id === id);
const trackContext = (p: Project): TrackContext => ({
  rate: rateOf(p),
  projectEnd: projectEnd(p),
  mainEmpty: p.clips.length === 0,
});
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function replaceAt<T>(xs: readonly T[], i: number, x: T): T[] {
  const out = xs.slice();
  out[i] = x;
  return out;
}

/** Commit new main-track clips: normalise (RULE-10) and refuse anything past the limit (RULE-03). */
function commitClips(p: Project, clips: readonly Clip[], changed: readonly string[]): EditResult {
  const normal = normaliseClips(clips, rateOf(p));
  if (layoutClips(normal, rateOf(p)).frames > maxProjectFrames(rateOf(p))) return same(p, ['notice.length_full']);
  return result(p, { ...p, clips: normal }, changed);
}

/**
 * Commit a clip whose length changed (trim, duration): when a longer clip would pass the limit, it
 * stops at the limit along `edge` with COPY-notice.length_limited (RULE-03). A shorter clip that would
 * pass it (its cross-fades shrink or go) is refused with COPY-notice.length_full: a cross-fade being
 * removed or shortened past the limit is refused (RULE-03), and a clip is never cut shorter than asked.
 */
function commitLength(p: Project, index: number, candidate: Clip, edge: 'start' | 'end'): EditResult {
  const rate = rateOf(p);
  const clips = replaceAt(p.clips, index, candidate);
  const normal = normaliseClips(clips, rate);
  if (layoutClips(normal, rate).frames <= maxProjectFrames(rate))
    return result(p, { ...p, clips: normal }, [candidate.id]);
  const current = p.clips[index];
  if (!current || clipFrames(candidate, rate) <= clipFrames(current, rate)) return same(p, ['notice.length_full']);
  const fit = fitClipFrames(clips, index, clipFrames(candidate, rate) - 1, clipFrames(current, rate), rate, edge);
  if (!fit) return same(p, ['notice.length_full']);
  return result(p, { ...p, clips: fit.clips }, [candidate.id], ['notice.length_limited']);
}

/** Remove main-track clips; the cross-fades into and out of each removed clip go too (RULE-05). */
function withoutClips(clips: readonly Clip[], gone: ReadonlySet<string>): Clip[] {
  const out: Clip[] = [];
  clips.forEach((clip, i) => {
    if (gone.has(clip.id)) return;
    const next = clips[i + 1];
    out.push(next && gone.has(next.id) && clip.crossFadeNext ? { ...clip, crossFadeNext: 0 } : clip);
  });
  return out;
}

function newClip(source: Source, id: string, rate: FrameRate): Clip {
  const common = {
    id,
    sourceId: source.id,
    placement: DEFAULT_PLACEMENT,
    adjustments: {},
    look: null,
    fadeIn: 0,
    fadeOut: 0,
    crossFadeNext: 0,
  };
  if (source.kind === 'photo')
    return { ...common, kind: 'photo', duration: frameStart(secondsToFrames(RULE_05.photoDefaultSeconds, rate), rate) };
  return {
    ...common,
    kind: 'video',
    in: 0,
    out: source.duration ?? 0,
    speedPct: RULE_06.defaultPct,
    volume: RULE_12.defaultVolume,
    muted: false,
  };
}

// ── media (F-001, RULE-01/02/03/05/12) ─────────────────────────────────────────────────────────

/** Implements: RULE-05 adding (end of the main track) and RULE-03 (placed up to the limit). */
function appendClip(p: Project, source: Source, nextId: NextId): EditResult {
  const rate = rateOf(p);
  const clip = newClip(source, nextId(), rate);
  const clips = [...p.clips, clip];
  const wanted = clipFrames(clip, rate);
  const fit = fitClipFrames(clips, clips.length - 1, wanted, minFrames(rate), rate);
  if (!fit) return same(p, ['notice.length_full']);
  return result(p, { ...p, clips: fit.clips }, [clip.id], fit.frames < wanted ? ['notice.length_limited'] : []);
}

/** Implements: RULE-12 placing on the audio track. */
function placeAudio(p: Project, sourceId: string, duration: Micros, playhead: Micros, nextId: NextId): EditResult {
  const placed = placeNewAudio(p.audioClips, snapToFrame(playhead, rateOf(p)), duration, trackContext(p));
  if (!placed) return same(p, ['notice.no_audio_room']);
  const clip: AudioClip = {
    id: nextId(),
    sourceId,
    start: placed.start,
    in: 0,
    out: placed.length,
    volume: RULE_12.defaultVolume,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  return result(p, { ...p, audioClips: [...p.audioClips, clip] }, [clip.id]);
}

function placeOne(p: Project, source: Source, playhead: Micros, nextId: NextId): EditResult {
  if (source.kind === 'audio') return placeAudio(p, source.id, source.duration ?? 0, playhead, nextId);
  return appendClip(p, source, nextId);
}

/**
 * Implements: F-001.R3/R6 — a batch of probed sources as one step. RULE-02: a video or audio source
 * shorter than the minimum is refused (COPY-reason.too_short). Each is kept as a source
 * (RULE-01) and placed: video and photo at the end of the main track, audio per RULE-12. Until the
 * user chooses a rate, the first video at 50 fps or more sets 60 fps (RULE-04).
 */
export function addMedia(p: Project, sources: readonly Source[], playhead: Micros, nextId: NextId): EditResult {
  let cur = p;
  const notices: Notice[] = [];
  const changed: string[] = [];
  for (const source of sources) {
    if (isTooShort(source)) {
      notices.push('reason.too_short');
      continue;
    }
    if (cur.sources.length >= RULE_02.maxSources) {
      notices.push('reason.too_many');
      continue;
    }
    const firstVideo = source.kind === 'video' && !cur.sources.some((s) => s.kind === 'video');
    cur = { ...cur, sources: [...cur.sources, source] };
    changed.push(source.id);
    if (
      firstVideo &&
      !cur.frame.frameRateChosen &&
      (source.frameRate ?? 0) >= RULE_04.detectHighRateFrom &&
      cur.frame.frameRate !== 60
    ) {
      const r = retime(cur, 60, false);
      cur = r.project;
      notices.push(...r.notices);
    }
    const r = placeOne(cur, source, playhead, nextId);
    cur = r.project;
    notices.push(...r.notices);
    changed.push(...r.changed);
  }
  return result(p, cur, changed, notices);
}

/** Implements: F-001.R4 / AC14 — place a source again: a new clip of the whole source. */
export function placeSource(p: Project, sourceId: string, playhead: Micros, nextId: NextId): EditResult {
  const source = p.sources.find((s) => s.id === sourceId);
  return source ? placeOne(p, source, playhead, nextId) : same(p);
}

/** Implements: F-001.R4 — removing a source also removes its clips (RULE-05 delete rules). */
export function removeSource(p: Project, sourceId: string): EditResult {
  if (!p.sources.some((s) => s.id === sourceId)) return same(p);
  const goneClips = p.clips.filter((c) => c.sourceId === sourceId).map((c) => c.id);
  const goneAudio = p.audioClips.filter((a) => a.sourceId === sourceId).map((a) => a.id);
  const clips = normaliseClips(withoutClips(p.clips, new Set(goneClips)), rateOf(p));
  return result(
    p,
    {
      ...p,
      sources: p.sources.filter((s) => s.id !== sourceId),
      clips,
      audioClips: p.audioClips.filter((a) => a.sourceId !== sourceId),
    },
    [sourceId, ...goneClips, ...goneAudio],
  );
}

// ── arrange (F-003, RULE-05, RULE-03) ──────────────────────────────────────────────────────────

/**
 * Implements: RULE-05 reorder — the clip moves to index `to` of the resulting order. A cross-fade
 * stays only if the same two clips are still adjacent in the same order; refused with
 * COPY-notice.length_full if that would pass the limit (RULE-03).
 */
export function moveClip(p: Project, id: string, to: number): EditResult {
  const from = clipIndex(p, id);
  const clip = p.clips[from];
  if (!clip) return same(p);
  const target = clamp(Math.round(to), 0, p.clips.length - 1);
  if (target === from) return same(p);
  const order = p.clips.filter((c) => c.id !== id);
  order.splice(target, 0, clip);
  const nextOf = new Map(p.clips.map((c, i) => [c.id, p.clips[i + 1]?.id]));
  const clips = order.map((c, i) =>
    c.crossFadeNext && nextOf.get(c.id) !== order[i + 1]?.id ? { ...c, crossFadeNext: 0 } : c,
  );
  return commitClips(p, clips, [id]);
}

/** Implements: RULE-05 delete (clips close the gap), and deleting text layers and audio clips. */
export function deleteItem(p: Project, id: string): EditResult {
  if (p.clips.some((c) => c.id === id))
    return result(p, { ...p, clips: normaliseClips(withoutClips(p.clips, new Set([id])), rateOf(p)) }, [id]);
  if (p.textLayers.some((t) => t.id === id))
    return result(p, { ...p, textLayers: p.textLayers.filter((t) => t.id !== id) }, [id]);
  if (p.audioClips.some((a) => a.id === id))
    return result(p, { ...p, audioClips: p.audioClips.filter((a) => a.id !== id) }, [id]);
  return same(p);
}

/**
 * Implements: RULE-05 duplicate — the copy goes right after the original and takes its cross-fade
 * into the next clip; RULE-03 — shortened at its end to fit, or refused.
 */
export function duplicateClip(p: Project, id: string, nextId: NextId): EditResult {
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  if (!clip) return same(p);
  const rate = rateOf(p);
  const copy: Clip = { ...clip, id: nextId() };
  const clips = [...p.clips.slice(0, i), { ...clip, crossFadeNext: 0 }, copy, ...p.clips.slice(i + 1)];
  const wanted = clipFrames(copy, rate);
  const fit = fitClipFrames(clips, i + 1, wanted, minFrames(rate), rate);
  if (!fit) return same(p, ['notice.length_full']);
  return result(p, { ...p, clips: fit.clips }, [copy.id], fit.frames < wanted ? ['notice.length_limited'] : []);
}

// ── trim and split (F-004, RULE-05, RULE-10, RULE-12) ──────────────────────────────────────────

/** Implements: RULE-05 trim of a video clip's in point within its source, never below 0.1 s. */
export function setClipIn(p: Project, id: string, inPoint: Micros): EditResult {
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  if (!clip || clip.kind !== 'video') return same(p);
  const rate = rateOf(p);
  const out = clip.out ?? 0;
  let newIn = clamp(Math.round(inPoint), 0, out);
  if (clipFrames({ ...clip, in: newIn }, rate) < minFrames(rate))
    newIn = Math.max(0, out - rangeForFrames(minFrames(rate), speedOf(clip), rate));
  if (newIn === clip.in) return same(p);
  return commitLength(p, i, { ...clip, in: newIn }, 'start');
}

/** Implements: RULE-05 trim of a video clip's out point; a video can't extend beyond its source. */
export function setClipOut(p: Project, id: string, outPoint: Micros): EditResult {
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  if (!clip || clip.kind !== 'video') return same(p);
  const rate = rateOf(p);
  const inPoint = clip.in ?? 0;
  const limit = Math.max(sourceEnd(p, clip.sourceId) ?? clip.out ?? 0, clip.out ?? 0);
  let newOut = clamp(Math.round(outPoint), inPoint, limit);
  if (clipFrames({ ...clip, out: newOut }, rate) < minFrames(rate))
    newOut = Math.min(limit, inPoint + rangeForFrames(minFrames(rate), speedOf(clip), rate));
  if (newOut === clip.out) return same(p);
  return commitLength(p, i, { ...clip, out: newOut }, 'end');
}

function setPhotoFrames(p: Project, i: number, frames: number): EditResult {
  const clip = p.clips[i];
  if (!clip || clip.kind !== 'photo') return same(p);
  const rate = rateOf(p);
  const n = clamp(frames, minFrames(rate), secondsToFrames(RULE_05.photoMaxSeconds, rate));
  const duration = frameStart(n, rate);
  if (duration === clip.duration) return same(p);
  return commitLength(p, i, { ...clip, duration }, 'end');
}

/** Implements: RULE-05 photo duration 0.1–60 s, applied as whole frames. */
export function setPhotoDuration(p: Project, id: string, duration: Micros): EditResult {
  return setPhotoFrames(p, clipIndex(p, id), framesOf(duration, rateOf(p)));
}

/**
 * Implements: F-004.R6 (start here / end here) and edge drags — trim the item's start or end to the
 * timeline time `t` (a clip, text layer or audio clip). An audio clip stays within its source.
 */
export function trimTo(p: Project, id: string, edge: 'start' | 'end', t: Micros): EditResult {
  const rate = rateOf(p);
  const k = nearestFrame(Math.max(0, t), rate);
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  if (clip) {
    const span = layoutClips(p.clips, rate).spans[i]!;
    if (edge === 'start') {
      // A main-track clip stays where it is (INV-03): its start edge is an offset from its own start, which
      // may be negative (a trimmed start dragged back out, or a photo made longer at its start; may ask for
      // a time before 0). Whole frames, the nearest one; setClipIn / the photo limits clamp it.
      const delta = t - frameStart(span.startFrame, rate);
      const frames = Math.sign(delta) * nearestFrame(Math.abs(delta), rate);
      if (clip.kind === 'photo') return setPhotoFrames(p, i, span.frames - frames);
      const offset = frames < 0 ? -frameStart(-frames, rate) : frameStart(frames, rate);
      return setClipIn(p, id, (clip.in ?? 0) + Math.round((offset * speedOf(clip)) / 100));
    }
    if (clip.kind === 'photo') return setPhotoFrames(p, i, k - span.startFrame);
    const n = Math.max(k - span.startFrame, minFrames(rate));
    return setClipOut(p, id, (clip.in ?? 0) + rangeForFrames(n, speedOf(clip), rate));
  }
  const layer = p.textLayers.find((x) => x.id === id);
  if (layer)
    return edge === 'start'
      ? setTextTimes(p, id, frameStart(k, rate), layer.end)
      : setTextTimes(p, id, layer.start, frameStart(k, rate));
  const a = p.audioClips.find((x) => x.id === id);
  if (a) {
    const others = p.audioClips.filter((x) => x.id !== a.id);
    const next = trimAudioClip(a, others, edge, frameStart(k, rate), sourceEnd(p, a.sourceId), rate);
    if (next === a) return same(p);
    return result(p, { ...p, audioClips: p.audioClips.map((x) => (x.id === a.id ? next : x)) }, [a.id]);
  }
  return same(p);
}

/**
 * Implements: RULE-05 split at the playhead (at least 0.1 s from both ends; else
 * COPY-notice.split_too_close) for clips, text layers and audio clips. Clip halves keep every setting;
 * only the first keeps the fade in, only the second the fade out and the cross-fade into the next
 * clip; a split inside a cross-fade removes it (RULE-03 applies).
 */
export function splitAt(p: Project, id: string, t: Micros, nextId: NextId): EditResult {
  const rate = rateOf(p);
  const k = nearestFrame(Math.max(0, t), rate);
  const min = minFrames(rate);
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  if (clip) {
    const layout = layoutClips(p.clips, rate);
    const incoming = i > 0 ? (layout.spans[i - 1]?.crossFadeFrames ?? 0) : 0;
    const split = splitClip(clip, layout.spans[i]!, incoming, k, rate, nextId());
    if (!split) return same(p, ['notice.split_too_close']);
    const clips: Clip[] = [...p.clips.slice(0, i), split.first, split.second, ...p.clips.slice(i + 1)];
    const prev = clips[i - 1];
    if (prev && split.removeIncoming) clips[i - 1] = { ...prev, crossFadeNext: 0 };
    return commitClips(p, clips, [clip.id, split.second.id]);
  }
  const ti = p.textLayers.findIndex((x) => x.id === id);
  const layer = p.textLayers[ti];
  if (layer) {
    const time = frameStart(k, rate);
    const s = nearestFrame(layer.start, rate);
    const e = nearestFrame(layer.end, rate);
    if (k - s < min || e - k < min) return same(p, ['notice.split_too_close']);
    const second: TextLayer = { ...layer, id: nextId(), start: time };
    const layers = [...p.textLayers.slice(0, ti), { ...layer, end: time }, second, ...p.textLayers.slice(ti + 1)];
    return result(p, { ...p, textLayers: layers }, [layer.id, second.id]);
  }
  const ai = p.audioClips.findIndex((x) => x.id === id);
  const a = p.audioClips[ai];
  if (a) {
    const time = frameStart(k, rate);
    if (time - a.start < minDuration(rate) || audioEnd(a) - time < minDuration(rate))
      return same(p, ['notice.split_too_close']);
    const cut = a.in + (time - a.start);
    const first = fitAudioFades({ ...a, out: cut, fadeOut: 0 }, rate);
    const second = fitAudioFades({ ...a, id: nextId(), start: time, in: cut, fadeIn: 0 }, rate);
    const clips = [...p.audioClips.slice(0, ai), first, second, ...p.audioClips.slice(ai + 1)];
    return result(p, { ...p, audioClips: clips }, [a.id, second.id]);
  }
  return same(p);
}

// ── speed (F-005, RULE-06) ─────────────────────────────────────────────────────────────────────

/**
 * Implements: RULE-06, F-005.R4/R5 — 0.25× to 4× in 0.05× steps. An increase stops at the fastest
 * step that keeps the clip at its minimum length, and a change that would break RULE-03 stops at the
 * slowest step that fits. The first stop shows COPY-notice.speed_limited, the second
 * COPY-notice.length_limited.
 */
export function setSpeed(p: Project, id: string, speedPct: number): EditResult {
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  if (!clip || clip.kind !== 'video') return same(p);
  const rate = rateOf(p);
  const tryAt = (sp: number) => normaliseClips(replaceAt(p.clips, i, { ...clip, speedPct: sp }), rate);
  const fits = (sp: number) => layoutClips(tryAt(sp), rate).frames <= maxProjectFrames(rate);
  const { speedPct: speed, limit } = speedFor(clip, speedPct, rate, fits);
  const notices: Notice[] =
    limit === 'min' ? ['notice.speed_limited'] : limit === 'length' ? ['notice.length_limited'] : [];
  if (speed === speedOf(clip)) return same(p, notices);
  if (!fits(speed)) return same(p, ['notice.length_full']);
  return result(p, { ...p, clips: tryAt(speed) }, [id], notices);
}

// ── fades and cross-fades (F-009, RULE-10) ─────────────────────────────────────────────────────

/**
 * Implements: RULE-10 clip fade (0–3 s) or audio clip fade (0–5 s), picked in 0.1 s steps and
 * applied as whole frames; values beyond the limits are reduced to the nearest allowed value.
 */
export function setFade(p: Project, id: string, edge: 'in' | 'out', tenths: number): EditResult {
  const rate = rateOf(p);
  const key = edge === 'in' ? 'fadeIn' : 'fadeOut';
  const otherKey = edge === 'in' ? 'fadeOut' : 'fadeIn';
  const want = pickedFrames(Math.max(0, tenths), rate);
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  if (clip) {
    const room = clipFrames(clip, rate) - framesOf(clip[otherKey], rate);
    const value = frameStart(clamp(want, 0, Math.min(maxClipFadeFrames(rate), room)), rate);
    if (value === clip[key]) return same(p);
    return result(p, { ...p, clips: replaceAt(p.clips, i, { ...clip, [key]: value }) }, [id]);
  }
  const a = p.audioClips.find((x) => x.id === id);
  if (a) {
    const room = frameIndexAt(Math.max(0, a.out - a.in - a[otherKey]), rate);
    const value = frameStart(clamp(want, 0, Math.min(maxAudioFadeFrames(rate), room)), rate);
    if (value === a[key]) return same(p);
    return result(p, { ...p, audioClips: p.audioClips.map((x) => (x.id === id ? { ...a, [key]: value } : x)) }, [id]);
  }
  return same(p);
}

/** Whether a cross-fade can join a clip and the next one, and if not, the reason to show. */
export interface CrossFadeAvailability {
  readonly available: boolean;
  /** Shown beside the unavailable control; null when there is no next clip to join. */
  readonly reason: Notice | null;
}

/**
 * Implements: RULE-10, F-009.R7 — a cross-fade between a clip and the next is unavailable when
 * either is too short to hold the 0.1 s minimum within half its length, with
 * COPY-notice.crossfade_too_short. The last clip has no next clip to join (no reason).
 */
export function crossFadeAvailability(p: Project, id: string): CrossFadeAvailability {
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  const next = p.clips[i + 1];
  if (!clip || !next) return { available: false, reason: null };
  const rate = rateOf(p);
  const room = crossFadeLimit(clipFrames(clip, rate), clipFrames(next, rate), rate);
  return room < minCrossFadeFrames(rate)
    ? { available: false, reason: 'notice.crossfade_too_short' }
    : { available: true, reason: null };
}

/**
 * Implements: RULE-10 cross-fade between a clip and the next — 0.1–2 s and at most half of either
 * clip, picked in 0.1 s steps (0 removes it); unavailable between clips too short to hold it
 * (F-009.R7). Removing or shortening it is refused with COPY-notice.length_full when the project
 * would pass the limit (RULE-03).
 */
export function setCrossFade(p: Project, id: string, tenths: number): EditResult {
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  const next = p.clips[i + 1];
  if (!clip || !next) return same(p);
  const rate = rateOf(p);
  let value = 0;
  if (tenths > 0) {
    const { available, reason } = crossFadeAvailability(p, id);
    if (!available) return same(p, reason ? [reason] : []);
    const n = Math.min(
      pickedFrames(tenths, rate, minCrossFadeFrames(rate)),
      crossFadeLimit(clipFrames(clip, rate), clipFrames(next, rate), rate),
    );
    value = frameStart(n, rate);
  }
  if (value === clip.crossFadeNext) return same(p);
  return commitClips(p, replaceAt(p.clips, i, { ...clip, crossFadeNext: value }), [id]);
}

// ── placement, adjustments, looks (F-006, F-007, F-008; RULE-07/08/09) ─────────────────────────

function updateClip(p: Project, id: string, change: (c: Clip) => Clip): EditResult {
  const i = clipIndex(p, id);
  const clip = p.clips[i];
  if (!clip) return same(p);
  const next = change(clip);
  return next === clip ? same(p) : result(p, { ...p, clips: replaceAt(p.clips, i, next) }, [id]);
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Implements: RULE-07 Fit/Fill, scale, position, rotate, flip. */
export function setPlacement(p: Project, id: string, change: Partial<Placement>): EditResult {
  return updateClip(p, id, (c) => {
    const placement = clampPlacement({ ...c.placement, ...change });
    return sameJson(placement, c.placement) ? c : { ...c, placement };
  });
}

/** Implements: RULE-07 Reset. */
export function resetPlacement(p: Project, id: string): EditResult {
  return updateClip(p, id, (c) =>
    sameJson(c.placement, DEFAULT_PLACEMENT) ? c : { ...c, placement: DEFAULT_PLACEMENT },
  );
}

/** Implements: RULE-08 setting adjustments within their ranges. */
export function setAdjustments(p: Project, id: string, change: Partial<Adjustments>): EditResult {
  return updateClip(p, id, (c) => {
    const adjustments = clampAdjustments({ ...c.adjustments, ...change });
    return sameJson(adjustments, c.adjustments) ? c : { ...c, adjustments };
  });
}

/** Implements: RULE-08 reset one adjustment. */
export function resetAdjustment(p: Project, id: string, name: AdjustmentName): EditResult {
  return updateClip(p, id, (c) => {
    if (c.adjustments[name] === undefined) return c;
    const adjustments: Record<string, number | undefined> = { ...c.adjustments };
    delete adjustments[name];
    return { ...c, adjustments: adjustments as Adjustments };
  });
}

/** Implements: RULE-08 Reset all; RULE-24 it also returns every colour tool to default; the look is kept. */
export function resetAdjustments(p: Project, id: string): EditResult {
  return updateClip(p, id, (c) =>
    Object.keys(c.adjustments).length || c.colourTools ? withColourTools({ ...c, adjustments: {} }, undefined) : c,
  );
}

/** Implements: RULE-09 choosing a look (or None) keeps the adjustments; intensity 0–100. */
export function setLook(p: Project, id: string, look: Look): EditResult {
  return updateClip(p, id, (c) => {
    const next = clampLook(look);
    return sameJson(next, c.look) ? c : { ...c, look: next };
  });
}

/** Implements: RULE-08 / RULE-24 copy — adjustments, look and colour tools (when any is set). */
export const gradeOf = (clip: Clip): Grade =>
  clip.colourTools
    ? { adjustments: clip.adjustments, look: clip.look, colourTools: clip.colourTools }
    : { adjustments: clip.adjustments, look: clip.look };

/** Implements: RULE-08 paste; RULE-24 the colour tools come with it. */
export function pasteGrade(p: Project, id: string, grade: Grade): EditResult {
  return updateClip(p, id, (c) =>
    sameJson(gradeOf(c), grade)
      ? c
      : withColourTools(
          { ...c, adjustments: clampAdjustments(grade.adjustments), look: clampLook(grade.look) },
          grade.colourTools,
        ),
  );
}

/**
 * Implements: RULE-08 Apply to all — the clip's adjustments and look onto every other clip, one step;
 * RULE-24 with its colour tools.
 */
export function applyToAll(p: Project, id: string): EditResult {
  const source = p.clips.find((c) => c.id === id);
  if (!source) return same(p);
  const grade = gradeOf(source);
  const changed: string[] = [];
  const clips = p.clips.map((c) => {
    if (c.id === id || sameJson(gradeOf(c), grade)) return c;
    changed.push(c.id);
    return withColourTools({ ...c, adjustments: grade.adjustments, look: grade.look }, grade.colourTools);
  });
  return changed.length ? result(p, { ...p, clips }, changed) : same(p);
}

// ── colour tools (F-024, F-025, F-026, F-027; RULE-24, D-053) ──────────────────────────────────────
// Each operation is one RULE-13 step (a slider drag through a gesture, a choice, a swap, a reset). Values
// are normalised (MOD-Core `normaliseColourTools`): defaults are dropped, so a reset tool leaves no trace and
// a drag back to where it began leaves the same document (no step). Which mixer range is shown is UI state,
// never stored (RULE-24 *History*). Colour replace (RULE-25, F-028): add, edit, remove and reset replacements.

/** The clip with these colour tools, normalised; the field is absent when every tool is at default. */
function withColourTools(c: Clip, tools: ColourTools | undefined): Clip {
  const next = normaliseColourTools(tools);
  if (sameJson(next, c.colourTools)) return c;
  if (next) return { ...c, colourTools: next };
  if (!c.colourTools) return c;
  const out: { -readonly [K in keyof Clip]: Clip[K] } = { ...c };
  delete out.colourTools;
  return out;
}

/** The tools without one of them (it returns to its defaults). */
function without(t: ColourTools, tool: keyof ColourTools): ColourTools {
  const out: { -readonly [K in keyof ColourTools]: ColourTools[K] } = { ...t };
  delete out[tool];
  return out;
}

function updateTools(p: Project, id: string, change: (t: ColourTools) => ColourTools): EditResult {
  return updateClip(p, id, (c) => withColourTools(c, change(c.colourTools ?? {})));
}

/** Implements: F-024.R1/R4, RULE-24 *Colour mixer* — set (or reset to 0) a range's Hue, Saturation, Lightness. */
export function setMixer(p: Project, id: string, range: ColourRangeName, change: Partial<MixerRange>): EditResult {
  return updateTools(p, id, (t) => ({
    ...t,
    mixer: { ...t.mixer, [range]: { ...t.mixer?.[range], ...change } },
  }));
}

/** Implements: F-024.R4 — the colour mixer's Reset: all 24 values to 0. */
export function resetMixer(p: Project, id: string): EditResult {
  return updateTools(p, id, (t) => without(t, 'mixer'));
}

/**
 * Implements: F-025.R1/R4, RULE-24 *Colour pop* — the kept colour (null: None, which keeps Range and Amount),
 * Range and Amount (resetting a value sets its default: Range 50, Amount 100).
 */
export function setPop(p: Project, id: string, change: Partial<Pop>): EditResult {
  return updateTools(p, id, (t) => ({ ...t, pop: { ...t.pop, ...change } }));
}

/** Implements: F-025.R4 — colour pop's Reset: None, Range 50, Amount 100. */
export function resetPop(p: Project, id: string): EditResult {
  return updateTools(p, id, (t) => without(t, 'pop'));
}

/** Implements: F-026.R1/R4, RULE-24 *Split toning* — hues (0–359°), strengths, Balance. */
export function setSplitToning(p: Project, id: string, change: Partial<SplitToning>): EditResult {
  return updateTools(p, id, (t) => ({ ...t, splitToning: { ...t.splitToning, ...change } }));
}

/** Implements: F-026.R4 — split toning's Reset: strengths 0, hues 210° and 35°, Balance 0. */
export function resetSplitToning(p: Project, id: string): EditResult {
  return updateTools(p, id, (t) => without(t, 'splitToning'));
}

/**
 * Implements: F-027.R1/R3, RULE-24 *Duotone* choosing — a built-in pair (its colours), Custom (the colours
 * shown last on this clip, else Midnight & Peach's) or None (null: off, the colours kept for Custom).
 * Choosing a pair or Custom starts Strength at 100.
 */
export function chooseDuotone(p: Project, id: string, choice: DuotoneChoice | null): EditResult {
  return updateTools(p, id, (t) => {
    const cur = t.duotone;
    if (choice === null) return cur?.on ? { ...t, duotone: { ...cur, on: false } } : t;
    if (cur?.on && cur.pair === choice) return t;
    return { ...t, duotone: { on: true, pair: choice, ...duotoneStart(choice, cur), strength: 100 } };
  });
}

/**
 * Implements: F-027.R1/R3/R5 — Strength (Reset: 100) and, in Custom, the shadows and highlights colours
 * (#RRGGBB; anything else is ignored). A built-in pair's colours are its own, so they change only in Custom.
 */
export function setDuotone(
  p: Project,
  id: string,
  change: { readonly strength?: number; readonly shadows?: string; readonly highlights?: string },
): EditResult {
  return updateTools(p, id, (t) => {
    const cur = t.duotone;
    if (!cur?.on) return t;
    const custom = cur.pair === 'custom';
    const shadows = change.shadows !== undefined && custom ? normaliseHex(change.shadows) : null;
    const highlights = change.highlights !== undefined && custom ? normaliseHex(change.highlights) : null;
    return {
      ...t,
      duotone: {
        ...cur,
        strength: change.strength ?? cur.strength,
        shadows: shadows ?? cur.shadows,
        highlights: highlights ?? cur.highlights,
      },
    };
  });
}

/** Implements: F-027.R3 — Swap exchanges Custom's two colours (one step). */
export function swapDuotone(p: Project, id: string): EditResult {
  return updateTools(p, id, (t) => {
    const cur = t.duotone;
    if (!cur?.on || cur.pair !== 'custom') return t;
    return { ...t, duotone: { ...cur, shadows: cur.highlights, highlights: cur.shadows } };
  });
}

/** Implements: F-027.R5, RULE-24 — duotone's Reset: None, and the remembered colours are forgotten. */
export function resetDuotone(p: Project, id: string): EditResult {
  return updateTools(p, id, (t) => without(t, 'duotone'));
}

/**
 * Implements: RULE-25 *Each replacement*, *Grey and faint From colours*, F-028.R1/R4 — a successful pick adds a
 * replacement with From and To both the picked colour, Range 30 and Softness 50 (one step). Refused, changing
 * nothing: a grey colour (COPY-notice.replace_grey) and a fourth replacement (RULE-25 *Count*). A faint colour is
 * added with COPY-notice.replace_faint.
 */
export function addReplacement(p: Project, id: string, hex: string): EditResult {
  const colour = normaliseHex(hex);
  if (!colour) return same(p);
  const status = fromStatus(colour);
  if (status === 'grey') return same(p, ['notice.replace_grey']);
  const r = updateTools(p, id, (t) =>
    (t.replace?.length ?? 0) >= REPLACE_MAX
      ? t
      : {
          ...t,
          replace: [
            ...(t.replace ?? []),
            { from: colour, to: colour, range: REPLACE_RANGE, softness: REPLACE_SOFTNESS },
          ],
        },
  );
  return status === 'faint' && r.project !== p ? { ...r, notices: ['notice.replace_faint'] } : r;
}

/**
 * Implements: RULE-25 *Each replacement*, F-028.R2/R4/R6 — one replacement's From, To, Range or Softness (Range and
 * Softness reset to 30 and 50 by setting them). Picking again or entering a From colour sets From only; To is kept. A
 * grey From is refused (COPY-notice.replace_grey) and From stays as it was; a faint one is accepted with
 * COPY-notice.replace_faint.
 */
export function setReplacement(p: Project, id: string, index: number, change: Partial<ReplacementValues>): EditResult {
  let notices: Notice[] = [];
  if (change.from !== undefined) {
    const from = normaliseHex(change.from);
    const status = from ? fromStatus(from) : 'grey';
    if (!from || status === 'grey') return same(p, from ? ['notice.replace_grey'] : []);
    if (status === 'faint') notices = ['notice.replace_faint'];
  }
  if (change.to !== undefined && !normaliseHex(change.to)) return same(p);
  const r = updateTools(p, id, (t) => {
    const list = t.replace ?? [];
    if (!list[index]) return t;
    return { ...t, replace: list.map((x, i) => (i === index ? { ...x, ...change } : x)) };
  });
  // RULE-25: the faint hint is shown once per pick or entry, also when From was that colour already.
  const exists = !!p.clips.find((c) => c.id === id)?.colourTools?.replace?.[index];
  return exists && notices.length ? { ...r, notices } : r;
}

/** Implements: RULE-25 *Each replacement*, F-028.R1 — a replacement removed (one step, RULE-24 *History*). */
export function removeReplacement(p: Project, id: string, index: number): EditResult {
  return updateTools(p, id, (t) => {
    const list = t.replace ?? [];
    if (!list[index]) return t;
    return { ...t, replace: list.filter((_, i) => i !== index) };
  });
}

/** Implements: F-028.R6, RULE-24 — colour replace's Reset: every replacement removed (one step). */
export function resetReplace(p: Project, id: string): EditResult {
  return updateTools(p, id, (t) => without(t, 'replace'));
}

// ── sound (F-011, RULE-12) ─────────────────────────────────────────────────────────────────────

/**
 * A video clip's sound settings changed in place: a stored value keeps its place in the clip and an unstored
 * one is only added when it differs from the default. New clips store both (`newClip`), so a slider dragged
 * away and back to where it began gives the very same document and the gesture leaves no undo step (build
 * question 104, F-014.R4); setting a clip that stores neither to the defaults changes nothing.
 */
function withSound(c: Clip, volume: number, muted: boolean): Clip {
  const next: { -readonly [K in keyof Clip]: Clip[K] } = { ...c };
  if (c.volume !== undefined || volume !== RULE_12.defaultVolume) next.volume = volume;
  if (c.muted !== undefined || muted) next.muted = muted;
  return next;
}

/** Implements: RULE-12 volume 0–200 % for a video clip or an audio clip. */
export function setVolume(p: Project, id: string, volume: number): EditResult {
  const v = clamp(Math.round(volume), RULE_12.minVolume, RULE_12.maxVolume);
  const clip = p.clips.find((c) => c.id === id);
  if (clip)
    return clip.kind === 'video'
      ? updateClip(p, id, (c) => ((c.volume ?? RULE_12.defaultVolume) === v ? c : withSound(c, v, c.muted === true)))
      : same(p);
  const a = p.audioClips.find((x) => x.id === id);
  if (!a || a.volume === v) return same(p);
  return result(p, { ...p, audioClips: p.audioClips.map((x) => (x.id === id ? { ...x, volume: v } : x)) }, [id]);
}

/** Implements: RULE-12 mute silences without losing the volume. */
export function setMuted(p: Project, id: string, muted: boolean): EditResult {
  const clip = p.clips.find((c) => c.id === id);
  if (clip)
    return clip.kind === 'video'
      ? updateClip(p, id, (c) =>
          (c.muted === true) === muted ? c : withSound(c, c.volume ?? RULE_12.defaultVolume, muted),
        )
      : same(p);
  const a = p.audioClips.find((x) => x.id === id);
  if (!a || a.muted === muted) return same(p);
  return result(p, { ...p, audioClips: p.audioClips.map((x) => (x.id === id ? { ...x, muted } : x)) }, [id]);
}

/** RULE-12: every main-track clip with original sound (video) is already muted. */
export function allOriginalMuted(p: Project): boolean {
  const videos = p.clips.filter((c) => c.kind === 'video');
  return videos.length > 0 && videos.every((c) => c.muted);
}

/**
 * Implements: RULE-12 Mute original sound (D-022) — mutes every main-track clip that exists now as
 * one step; when all are already muted, unmutes them all.
 */
export function muteOriginal(p: Project): EditResult {
  const muted = !allOriginalMuted(p);
  const changed: string[] = [];
  const clips = p.clips.map((c) => {
    if (c.kind !== 'video' || (c.muted === true) === muted) return c;
    changed.push(c.id);
    return withSound(c, c.volume ?? RULE_12.defaultVolume, muted);
  });
  return changed.length ? result(p, { ...p, clips }, changed) : same(p);
}

// ── text (F-010, RULE-11) ──────────────────────────────────────────────────────────────────────

/** Implements: RULE-11 a new layer (empty content; the editing session types into it) at most 50. */
export function addText(p: Project, playhead: Micros, nextId: NextId): EditResult {
  if (p.textLayers.length >= RULE_11.maxLayers) return same(p, ['notice.text_limit']);
  const rate = rateOf(p);
  const [s, e] = newTextFrames(nearestFrame(Math.max(0, playhead), rate), projectFrames(p), rate);
  const layer: TextLayer = {
    id: nextId(),
    content: '',
    start: frameStart(s, rate),
    end: frameStart(e, rate),
    ...TEXT_DEFAULTS,
  };
  return result(p, { ...p, textLayers: [...p.textLayers, layer] }, [layer.id]);
}

function updateText(p: Project, id: string, change: (t: TextLayer) => TextLayer): EditResult {
  const layer = p.textLayers.find((t) => t.id === id);
  if (!layer) return same(p);
  const next = change(layer);
  return next === layer
    ? same(p)
    : result(p, { ...p, textLayers: p.textLayers.map((t) => (t.id === id ? next : t)) }, [id]);
}

/** Implements: RULE-11 content in NFC, at most 500 user-perceived characters (never split). */
export function editText(p: Project, id: string, content: string): EditResult {
  const text = clampText(content);
  return updateText(p, id, (t) => (t.content === text ? t : { ...t, content: text }));
}

/** Implements: RULE-11 empty text — a layer that is empty or whitespace when editing ends is removed. */
export function finishText(p: Project, id: string): EditResult {
  const layer = p.textLayers.find((t) => t.id === id);
  return layer && isBlankText(layer.content) ? deleteItem(p, id) : same(p);
}

export type TextStyle = Partial<
  Pick<TextLayer, 'typeface' | 'size' | 'colour' | 'style' | 'boxColour' | 'align' | 'x' | 'y' | 'fade'>
>;

/** Implements: RULE-11 typeface, size (2–20 %), colour, style, box colour, alignment, position, fade. */
export function setTextStyle(p: Project, id: string, change: TextStyle): EditResult {
  return updateText(p, id, (t) => {
    const next = { ...t, ...change };
    next.size = clamp(next.size, RULE_11.minSize, RULE_11.maxSize);
    // RULE-11 *Position*: the block's centre, as fractions of the frame (kept within it, to 1/10 000).
    next.x = Math.round(clamp(next.x, 0, 1) * 10_000) / 10_000;
    next.y = Math.round(clamp(next.y, 0, 1) * 10_000) / 10_000;
    // Q104: a default value is not stored — the box colour is kept only while it differs from the default.
    if (next.boxColour === undefined || next.boxColour === contrastOf(next.colour)) delete next.boxColour;
    return sameJson(next, t) ? t : next;
  });
}

/**
 * Implements: CMP-Inspector "text layer" Reset — every RULE-11 setting back to its default (typeface, size,
 * colour, style, box colour, alignment, position, fade); the content and times stay. One step, none when
 * already there.
 */
export function resetTextStyle(p: Project, id: string): EditResult {
  return updateText(p, id, (t) => {
    const next: TextLayer = { id: t.id, content: t.content, start: t.start, end: t.end, ...TEXT_DEFAULTS };
    return sameJson(next, t) ? t : next;
  });
}

/** Implements: RULE-11 / F-010.R4 — a layer's start and end as frame starts, at least 0.1 s apart. */
export function setTextTimes(p: Project, id: string, start: Micros, end: Micros): EditResult {
  const rate = rateOf(p);
  return updateText(p, id, (t) => {
    let s = nearestFrame(Math.max(0, start), rate);
    let e = nearestFrame(Math.max(0, end), rate);
    if (e - s < minFrames(rate)) {
      if (e !== nearestFrame(t.end, rate)) e = s + minFrames(rate);
      else s = Math.max(0, e - minFrames(rate));
      if (e - s < minFrames(rate)) e = s + minFrames(rate);
    }
    const next = { ...t, start: frameStart(s, rate), end: frameStart(e, rate) };
    return next.start === t.start && next.end === t.end ? t : next;
  });
}

/** Implements: F-010.R7 bring forward / send back in the stacking order. */
export function restackText(p: Project, id: string, direction: 'forward' | 'back'): EditResult {
  const i = p.textLayers.findIndex((t) => t.id === id);
  const j = direction === 'forward' ? i + 1 : i - 1;
  if (i < 0 || j < 0 || j >= p.textLayers.length) return same(p);
  const layers = p.textLayers.slice();
  [layers[i], layers[j]] = [layers[j]!, layers[i]!];
  return result(p, { ...p, textLayers: layers }, [id]);
}

/** Implements: RULE-11 duplicate — same times, drawn on top. */
export function duplicateText(p: Project, id: string, nextId: NextId): EditResult {
  const layer = p.textLayers.find((t) => t.id === id);
  if (!layer) return same(p);
  if (p.textLayers.length >= RULE_11.maxLayers) return same(p, ['notice.text_limit']);
  const copy = { ...layer, id: nextId() };
  return result(p, { ...p, textLayers: [...p.textLayers, copy] }, [copy.id]);
}

/**
 * Implements: RULE-20/21 time controls — move a text layer or audio clip by whole frames (keeping its
 * length); an audio clip follows the RULE-12 move rule.
 */
export function moveItemTime(p: Project, id: string, deltaFrames: number): EditResult {
  const rate = rateOf(p);
  const layer = p.textLayers.find((t) => t.id === id);
  if (layer)
    return updateText(p, id, (t) => {
      const s = nearestFrame(t.start, rate);
      const e = nearestFrame(t.end, rate);
      const shift = Math.max(-s, deltaFrames);
      return shift === 0 ? t : { ...t, start: frameStart(s + shift, rate), end: frameStart(e + shift, rate) };
    });
  const a = p.audioClips.find((x) => x.id === id);
  if (a) return moveAudio(p, id, frameStart(Math.max(0, nearestFrame(a.start, rate) + deltaFrames), rate));
  return same(p);
}

// ── audio clips (F-011, RULE-12, D-021, D-027) ─────────────────────────────────────────────────

/** Implements: RULE-12 move rule; nothing changes (no step) when there is no room or no move. */
export function moveAudio(p: Project, id: string, requested: Micros): EditResult {
  const a = p.audioClips.find((x) => x.id === id);
  if (!a) return same(p);
  const start = moveTarget(p.audioClips, a, Math.max(0, requested), trackContext(p));
  if (start === null) return same(p);
  return result(p, { ...p, audioClips: p.audioClips.map((x) => (x.id === id ? { ...x, start } : x)) }, [id]);
}

/** Implements: RULE-12 duplicate — requested start at the original's end, placed by the move rule. */
export function duplicateAudio(p: Project, id: string, nextId: NextId): EditResult {
  const i = p.audioClips.findIndex((x) => x.id === id);
  const a = p.audioClips[i];
  if (!a) return same(p);
  const copy = { ...a, id: nextId() };
  const start = moveTarget(p.audioClips, copy, audioEnd(a), trackContext(p), null);
  if (start === null) return same(p);
  const clips = [...p.audioClips.slice(0, i + 1), { ...copy, start }, ...p.audioClips.slice(i + 1)];
  return result(p, { ...p, audioClips: clips }, [copy.id]);
}

// ── frame (F-012, RULE-04) ─────────────────────────────────────────────────────────────────────

/** Implements: RULE-04 aspect. */
export function setAspect(p: Project, aspect: Frame['aspect']): EditResult {
  return p.frame.aspect === aspect ? same(p) : result(p, { ...p, frame: { ...p.frame, aspect } }, []);
}

/** Implements: RULE-04 background. */
export function setBackground(p: Project, background: Frame['background']): EditResult {
  return p.frame.background === background ? same(p) : result(p, { ...p, frame: { ...p.frame, background } }, []);
}

/** Implements: RULE-04 the user chooses the frame rate (detection stops); every time is re-timed. */
export function setFrameRate(p: Project, rate: FrameRate): EditResult {
  return retime(p, rate, true);
}

/**
 * Implements: RULE-04 changes — times move to frame starts at the new rate; no clip, fade or
 * cross-fade goes below its minimum; RULE-03 — the last clip is shortened at its end to fit, with
 * COPY-notice.length_limited.
 */
function retime(p: Project, rate: FrameRate, chosen: boolean): EditResult {
  const frame: Frame = chosen
    ? { ...p.frame, frameRate: rate, frameRateChosen: true }
    : { ...p.frame, frameRate: rate };
  if (p.frame.frameRate === rate) return chosen && !p.frame.frameRateChosen ? result(p, { ...p, frame }, []) : same(p);
  const min = minFrames(rate);
  let clips = normaliseClips(
    p.clips.map((c) => retimeClip(c, rate, sourceEnd(p, c.sourceId))),
    rate,
  );
  const notices: Notice[] = [];
  const last = clips.length - 1;
  if (last >= 0 && layoutClips(clips, rate).frames > maxProjectFrames(rate)) {
    const wanted = clipFrames(clips[last]!, rate);
    // RULE-03 (build question 51, decided): when the last clip can't absorb the overflow, the change is
    // refused with COPY-notice.length_full.
    const fit = fitClipFrames(clips, last, wanted - 1, min, rate);
    if (!fit) return same(p, ['notice.length_full']);
    clips = fit.clips;
    notices.push('notice.length_limited');
  }
  const textLayers = p.textLayers.map((t) => {
    const s = nearestFrame(t.start, rate);
    const e = Math.max(nearestFrame(t.end, rate), s + min);
    return { ...t, start: frameStart(s, rate), end: frameStart(e, rate) };
  });
  const audioClips = retimeAudio(p.audioClips, rate, (id) => sourceEnd(p, id));
  // RULE-05 / RULE-03: an audio clip that can't reach its minimum at the new rate because its source's
  // end is unknown refuses the change, with COPY-notice.length_full (F-012.R4).
  if (!audioClips) return same(p, ['notice.length_full']);
  return result(p, { ...p, frame, clips, textLayers, audioClips }, [], notices);
}
