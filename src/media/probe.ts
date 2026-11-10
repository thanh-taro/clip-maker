// MOD-Media — probe-before-accept for one file, run in the analysis worker (ADR-0003 §4, ADR-0009).
// Order (architecture.md "Add media"): size → magic bytes → container headers → RULE-02 limits →
// real decoder configs → first frame and first sound window decoded. The file is read in slices only
// (F-001.R7, NFR-05). Implements: F-001.R2, RULE-01, RULE-02, F-023.R2.
import { checkVideoDecodes, checkAudioDecodes } from '../codec';
import { ContainerError, openInput, type OpenedInput } from '../container';
import {
  checkFileSize,
  checkLimits,
  photoFormat,
  photoLoadSize,
  sniff,
  SNIFF_BYTES,
  videoUseSize,
  type FrameRate,
  type RefusalReason,
  type Sniffed,
} from '../core';
import { photoHeaderSize, PHOTO_HEADER_BYTES } from './photo-header';
import type { ProbeOutcome, SizeClass } from './types';

const refuse = (reason: RefusalReason): ProbeOutcome => ({ ok: false, reason });

/** The RULE-01 refusal for a reader failure. A damaged file has no usable picture or sound. */
export function reasonForContainerError(e: ContainerError): RefusalReason {
  switch (e.code) {
    case 'unsupported':
      return 'reason.unsupported';
    case 'protected':
      return 'reason.protected';
    case 'no_media':
    case 'damaged':
      return 'reason.no_media';
  }
}

export function sizeClassOf(width: number, height: number): SizeClass {
  const px = width * height;
  return px > 3840 * 2160 ? 'above-uhd' : px > 1920 * 1080 ? 'uhd' : 'hd';
}

const bytesOf = async (file: Blob, n: number): Promise<Uint8Array> =>
  new Uint8Array(await file.slice(0, Math.min(n, file.size)).arrayBuffer());

/** Photos: header size → RULE-02 → decode (scaled on load when large) with the file's orientation. */
async function probePhoto(file: File, format: Sniffed, signal?: AbortSignal): Promise<ProbeOutcome> {
  const size = photoHeaderSize(format, await bytesOf(file, PHOTO_HEADER_BYTES));
  if (!size || size.width < 1 || size.height < 1) return refuse('reason.no_media');
  const limit = checkLimits({ kind: 'photo', ...size }, 30);
  if (limit) return refuse(limit);
  signal?.throwIfAborted();
  const load = photoLoadSize(size.width, size.height);
  const scaled = load.width !== size.width || load.height !== size.height;
  let bitmap: ImageBitmap;
  try {
    if (typeof createImageBitmap !== 'function') return refuse('reason.codec');
    bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      ...(scaled ? { resizeWidth: load.width, resizeHeight: load.height, resizeQuality: 'high' } : {}),
    });
  } catch {
    // AVIF where the device can't decode it, or a damaged image (RULE-01).
    return refuse(format === 'avif' ? 'reason.codec' : 'reason.no_media');
  }
  if (signal?.aborted) {
    bitmap.close();
    signal.throwIfAborted();
  }
  return {
    ok: true,
    probed: {
      source: { kind: 'photo', name: file.name, bytes: file.size, width: bitmap.width, height: bitmap.height },
      details: { format, rotation: 0, nativeWidth: size.width, nativeHeight: size.height, scaled },
      notices: [],
      bitmap,
    },
  };
}

/** CMP-MediaPanel thumbnails are drawn at 48 CSS px; this height covers 2× screens. */
export const THUMBNAIL_HEIGHT = 96;

/**
 * The media panel's thumbnail of a video (CMP-MediaPanel "sources"): its first decoded frame, scaled
 * to THUMBNAIL_HEIGHT (a few tens of kilobytes, ADR-0009 bounded caches). None when the device can't
 * scale a frame; the row then shows the kind icon alone.
 */
async function posterOf(frame: VideoFrame | null): Promise<ImageBitmap | undefined> {
  if (!frame || typeof createImageBitmap !== 'function') return undefined;
  try {
    const h = Math.min(THUMBNAIL_HEIGHT, frame.displayHeight);
    const w = Math.max(1, Math.round((frame.displayWidth * h) / frame.displayHeight));
    return await createImageBitmap(frame, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  } catch {
    return undefined;
  }
}

/** Video and audio containers: tracks → RULE-02 → real decode of the first packets. */
async function probeContainer(file: File, rate: FrameRate, signal?: AbortSignal): Promise<ProbeOutcome> {
  let input: OpenedInput;
  try {
    input = await openInput(file);
  } catch (e) {
    if (e instanceof ContainerError) return refuse(reasonForContainerError(e));
    throw e;
  }
  const onAbort = () => input.close();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const { video, audio } = input;
    const duration = Math.round(input.duration * 1e6);
    if (video) {
      const limit = checkLimits(
        { kind: 'video', width: video.displayWidth, height: video.displayHeight, duration },
        rate,
      );
      if (limit) return refuse(limit);
      let first: VideoFrame | null = null;
      const keep = (f: VideoFrame) => {
        first?.close();
        first = f;
      };
      let failed: Awaited<ReturnType<typeof checkVideoDecodes>>;
      let thumbnail: ImageBitmap | undefined;
      try {
        failed = await checkVideoDecodes(video.decoderConfig, input.packets('video'), { signal, onFirstFrame: keep });
        thumbnail = failed ? undefined : await posterOf(first);
      } finally {
        (first as VideoFrame | null)?.close();
      }
      if (failed) return refuse('reason.codec');
      const hasSound =
        audio !== null && (await checkAudioDecodes(audio.decoderConfig, input.packets('audio'), { signal })) === null;
      const used = videoUseSize(video.displayWidth, video.displayHeight);
      return {
        ok: true,
        probed: {
          source: {
            kind: 'video',
            name: file.name,
            bytes: file.size,
            duration,
            width: used.width,
            height: used.height,
            frameRate: video.frameRate,
            hasSound,
          },
          details: {
            format: input.format,
            rotation: video.rotation,
            nativeWidth: video.displayWidth,
            nativeHeight: video.displayHeight,
            scaled: used.width !== video.displayWidth || used.height !== video.displayHeight,
            sizeClass: sizeClassOf(video.displayWidth, video.displayHeight),
            keyframeSpacing: await input.keyframeSpacing(),
            colorSpace: video.colorSpace,
            hdr: video.hdr,
            firstTimestamp: video.firstTimestamp,
          },
          notices: audio !== null && !hasSound ? ['notice.no_sound'] : [],
          ...(thumbnail ? { thumbnail } : {}),
        },
      };
    }
    if (!audio) return refuse('reason.no_media');
    const limit = checkLimits({ kind: 'audio', duration }, rate);
    if (limit) return refuse(limit);
    if (await checkAudioDecodes(audio.decoderConfig, input.packets('audio'), { signal })) return refuse('reason.codec');
    return {
      ok: true,
      probed: {
        source: { kind: 'audio', name: file.name, bytes: file.size, duration, hasSound: true },
        details: { format: input.format, rotation: 0, scaled: false, firstTimestamp: audio.firstTimestamp },
        notices: [],
      },
    };
  } catch (e) {
    if (signal?.aborted) throw signal.reason;
    if (e instanceof ContainerError) return refuse(reasonForContainerError(e));
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    input.close();
  }
}

/**
 * Checks one file by its contents against RULE-01 and RULE-02 (F-001.R2) and, if it passes, says
 * what it is. Throws the signal's reason when cancelled (F-001.R6).
 */
export async function probeFile(file: File, rate: FrameRate, signal?: AbortSignal): Promise<ProbeOutcome> {
  const tooLarge = checkFileSize(file.size);
  if (tooLarge) return refuse(tooLarge);
  signal?.throwIfAborted();
  const format = sniff(await bytesOf(file, SNIFF_BYTES));
  if (format === null || format === 'heif') return refuse('reason.unsupported');
  signal?.throwIfAborted();
  return photoFormat(format) ? probePhoto(file, format, signal) : probeContainer(file, rate, signal);
}
