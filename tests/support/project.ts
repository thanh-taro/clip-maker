// Test fixtures: small builders for projects, sources, clips, text layers and audio clips.
import {
  DEFAULT_PLACEMENT,
  type AudioClip,
  type Clip,
  type FrameRate,
  type MusicTrack,
  type Project,
  type Source,
  type TextLayer,
} from '../../src/core';

export const S = 1_000_000;

/** A test catalog of bundled music tracks (ENT-MusicTrack). */
export const TRACKS: readonly MusicTrack[] = [
  { id: 'music-1', title: 'One', source: 'test', licence: 'CC0', duration: 60 * S },
  { id: 'm', title: 'M', source: 'test', licence: 'CC0', duration: 60 * S },
  { id: 'short', title: 'Short', source: 'test', licence: 'CC0', duration: 5 * S },
];

export function videoSource(id: string, seconds: number, extra: Partial<Source> = {}): Source {
  return {
    id,
    kind: 'video',
    name: `${id}.mp4`,
    bytes: 1000,
    duration: Math.round(seconds * S),
    width: 1920,
    height: 1080,
    frameRate: 30,
    hasSound: true,
    ...extra,
  };
}
export function photoSource(id: string, extra: Partial<Source> = {}): Source {
  return { id, kind: 'photo', name: `${id}.jpg`, bytes: 1000, width: 1200, height: 1600, ...extra };
}
export function audioSource(id: string, seconds: number): Source {
  return { id, kind: 'audio', name: `${id}.mp3`, bytes: 1000, duration: Math.round(seconds * S), hasSound: true };
}

const base = {
  placement: DEFAULT_PLACEMENT,
  adjustments: {},
  look: null,
  fadeIn: 0,
  fadeOut: 0,
  crossFadeNext: 0,
} as const;

/** A video clip using [inS, outS] of its source at speedPct. */
export function video(id: string, outS: number, extra: Partial<Clip> = {}, inS = 0): Clip {
  return {
    id,
    sourceId: `src-${id}`,
    kind: 'video',
    in: Math.round(inS * S),
    out: Math.round(outS * S),
    speedPct: 100,
    volume: 100,
    muted: false,
    ...base,
    ...extra,
  };
}
export function photo(id: string, seconds: number, extra: Partial<Clip> = {}): Clip {
  return { id, sourceId: `src-${id}`, kind: 'photo', duration: Math.round(seconds * S), ...base, ...extra };
}
export function text(id: string, startS: number, endS: number, extra: Partial<TextLayer> = {}): TextLayer {
  return {
    id,
    content: id,
    start: Math.round(startS * S),
    end: Math.round(endS * S),
    typeface: 'sans',
    size: 6,
    colour: 'white',
    style: 'outline',
    align: 'centre',
    x: 0.5,
    y: 0.8,
    fade: false,
    ...extra,
  };
}
export function audio(id: string, startS: number, endS: number, extra: Partial<AudioClip> = {}): AudioClip {
  return {
    id,
    sourceId: `src-${id}`,
    start: Math.round(startS * S),
    in: 0,
    out: Math.round((endS - startS) * S),
    volume: 100,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    ...extra,
  };
}

/** A project; sources are derived for every clip that has none, each as long as needed. */
export function proj(
  parts: {
    clips?: Clip[];
    textLayers?: TextLayer[];
    audioClips?: AudioClip[];
    sources?: Source[];
    rate?: FrameRate;
  } = {},
): Project {
  const clips = parts.clips ?? [];
  const audioClips = parts.audioClips ?? [];
  const sources: Source[] = [...(parts.sources ?? [])];
  const has = (id: string) => sources.some((s) => s.id === id);
  for (const c of clips)
    if (!has(c.sourceId))
      sources.push(c.kind === 'video' ? videoSource(c.sourceId, (c.out ?? 0) / S) : photoSource(c.sourceId));
  for (const a of audioClips) if (!has(a.sourceId)) sources.push(audioSource(a.sourceId, a.out / S));
  return {
    frame: { aspect: 'original', frameRate: parts.rate ?? 30, background: 'black' },
    sources,
    clips,
    textLayers: parts.textLayers ?? [],
    audioClips,
  };
}

export const ids = (p: Project): string[] => p.clips.map((c) => c.id);
export const seconds = (us: number): number => us / S;
