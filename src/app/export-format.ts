// MOD-App — the export panel's format note (CMP-ExportPanel "fallback" state, RULE-15, RULE-16):
// when the device can't encode the preferred format, the footer names the fallback in
// COPY-export.format_note in place of COPY-export.saves_as. Built with F-023 (R3); CMP-ExportPanel
// (F-015, F-016) shows it. Format names are technical names, the same in every language
// (build-spec-questions 60).
// Implements: F-023.R3, F-015.R2/R3 (UI text).
import { translate, type Language } from '../copy';
import type { AudioFormat, VideoFormat } from '../codec';

const CONTAINER: Record<VideoFormat['container'], string> = { mp4: 'MP4', webm: 'WebM' };
const CODEC: Record<string, string> = { h264: 'H.264', vp9: 'VP9', vp8: 'VP8', aac: 'AAC', opus: 'Opus' };

/** The preferred video format (RULE-15: MP4 with H.264 picture and AAC sound). */
const PREFERRED_VIDEO = { container: 'mp4', video: 'h264', audio: 'aac' } as const;

const codecs = (video: string, audio: string | null): string =>
  audio ? `${CODEC[video]} + ${CODEC[audio]}` : (CODEC[video] ?? video);

/**
 * The names for COPY-export.format_note: the container alone, or the container with its codecs when
 * the fallback keeps the preferred container (MP4 with Opus sound vs MP4 with AAC sound).
 */
export function videoFormatNames(f: VideoFormat): { format: string; preferred: string } {
  const sameContainer = f.container === PREFERRED_VIDEO.container;
  return sameContainer
    ? {
        format: `${CONTAINER[f.container]} (${codecs(f.video, f.audio)})`,
        preferred: `${CONTAINER.mp4} (${codecs(PREFERRED_VIDEO.video, PREFERRED_VIDEO.audio)})`,
      }
    : { format: CONTAINER[f.container], preferred: CONTAINER.mp4 };
}

/** COPY-export.format_note for a video export, or null when the preferred format is used. */
export function videoFormatNote(f: VideoFormat | null, lang: Language): string | null {
  if (!f || !f.fallback) return null;
  return translate(lang, 'export.format_note', videoFormatNames(f));
}

const AUDIO_NAME: Record<AudioFormat['id'], string> = { 'm4a-aac': 'M4A', 'ogg-opus': 'Ogg', wav: 'WAV' };

/**
 * COPY-export.format_note for the compressed audio-only choice (RULE-16), or null when it is the
 * preferred M4A. WAV is never a note: without any sound encoder the compressed choice is left out and
 * WAV is offered as itself (F-023.R5).
 */
export function audioFormatNote(f: AudioFormat, lang: Language): string | null {
  if (!f.fallback || f.id === 'wav') return null;
  return translate(lang, 'export.format_note', { format: AUDIO_NAME[f.id], preferred: AUDIO_NAME['m4a-aac'] });
}
