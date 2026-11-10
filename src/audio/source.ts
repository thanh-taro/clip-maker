// MOD-Audio — the decoded sound a voice reads (ADR-0008 §2, §6). The mixer reads 48 kHz stereo
// samples by source sample index; windowed decoding (MOD-Container/MOD-Codec, ADR-0008 §6) and
// bundled music provide this interface. Pure, no DOM.

/** A source's sound as 48 kHz stereo, readable at any range. */
export interface SoundSource {
  /** Length in 48 kHz samples. */
  readonly length: number;
  /** Fills L/R with source samples [from, from + L.length); zeros outside [0, length). */
  read(from: number, L: Float32Array, R: Float32Array): void;
}

/** Looks up a source's sound by source ID; undefined = not decoded (yet), heard as silence. */
export type SourceBank = (sourceId: string) => SoundSource | undefined;

/** A source held whole in memory (tests, short bundled tracks, decoded windows). */
export function pcmSource(L: Float32Array, R: Float32Array = L): SoundSource {
  const length = Math.min(L.length, R.length);
  return {
    length,
    read(from: number, outL: Float32Array, outR: Float32Array): void {
      const n = outL.length;
      const a = Math.max(0, Math.min(n, -from));
      const b = Math.max(a, Math.min(n, length - from));
      outL.fill(0, 0, a);
      outR.fill(0, 0, a);
      if (b > a) {
        outL.set(L.subarray(from + a, from + b), a);
        outR.set(R.subarray(from + a, from + b), a);
      }
      outL.fill(0, b);
      outR.fill(0, b);
    },
  };
}

/** A bank over a map of sources. */
export const bankOf =
  (sources: ReadonlyMap<string, SoundSource>): SourceBank =>
  (id) =>
    sources.get(id);

/** The parts of a project that say which sources have sound (MOD-Core `Project`). */
interface SoundProject {
  readonly sources: readonly { readonly id: string; readonly kind: string; readonly hasSound?: boolean }[];
  readonly audioClips: readonly { readonly sourceId: string }[];
}

/**
 * The sources whose sound is decoded: every video or audio source with sound, and every bundled track an
 * audio clip plays (ENT-MusicTrack: an audio clip's source that is not one of the project's sources).
 * Implements: F-011.R5 (bundled music in the same mix as the clips' sound), ADR-0008 §7.
 */
export function soundSourceIds(project: SoundProject): string[] {
  const ids = project.sources.filter((s) => s.kind === 'audio' || s.hasSound === true).map((s) => s.id);
  const known = new Set(project.sources.map((s) => s.id));
  for (const a of project.audioClips) if (!known.has(a.sourceId) && !ids.includes(a.sourceId)) ids.push(a.sourceId);
  return ids;
}
