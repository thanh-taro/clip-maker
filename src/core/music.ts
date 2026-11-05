// MOD-Core — bundled music tracks (ENT-MusicTrack, RULE-12) and where any source ends.
// An audio clip refers to a source or a bundled track; both bound how far the clip may extend.
import type { Project } from './project.gen';
import type { Micros } from './time';

/** ENT-MusicTrack: a public-domain track shipped with the tool (not a source, RULE-12). */
export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly licence: string;
  readonly duration: Micros;
}

/**
 * The bundled tracks. Empty until the music pack and its generated manifest land with F-011
 * (adapters/codegen.md "gen-music-manifest"); operations take this as their default catalog.
 */
export const MUSIC_TRACKS: readonly MusicTrack[] = Object.freeze([]);

/**
 * The end (duration) of a source or bundled track, or undefined when unknown. Callers treat an
 * unknown end as "the clip may not grow", so no clip can ever extend past its source (RULE-05, RULE-12).
 */
export function sourceEnd(
  project: Project,
  sourceId: string,
  tracks: readonly MusicTrack[] = MUSIC_TRACKS,
): Micros | undefined {
  return project.sources.find((s) => s.id === sourceId)?.duration ?? tracks.find((t) => t.id === sourceId)?.duration;
}
