// MOD-Engine — the sequential "decode every frame in order" reader the export uses (MOD-Engine public
// surface; ADR-0010). Same decoder slot and frame rules as the preview (INV-02): the frame for a
// source time is the one the container index presents there; requests move forward, so the decoder
// never restarts except at a backward step.
// Implements: F-015.R4 (the export shows the preview's frames), NFR-08 (each frame within 1 frame).
import type { Micros } from '../core';
import { openVideoSource } from './video';
import { MAX_FRAMES } from './frames';

export interface SequentialFrameReader {
  /** The frame shown at source time `t` (µs); the caller must not close it (the reader owns it). */
  frameAt(t: Micros): Promise<{ frame: VideoFrame; rotation: 0 | 90 | 180 | 270 } | null>;
  close(): void;
}

export async function createSequentialFrameReader(id: string, file: Blob): Promise<SequentialFrameReader> {
  const src = await openVideoSource(id, file);
  // Never flushed mid-clip: a flush forces a keyframe restart (ADR-0009 outcome rule 3).
  const slot = src.newSlot(MAX_FRAMES, { idleFlush: false });
  return {
    async frameAt(t) {
      const r = await slot.frameAt(t, 'exact');
      return r.frame ? { frame: r.frame, rotation: src.rotation } : null;
    },
    close() {
      slot.close();
      src.close();
    },
  };
}
