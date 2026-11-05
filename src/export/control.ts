// MOD-Export — the export worker's control logic, kept free of WebGL/WebCodecs so it is unit-tested with
// fakes: the frame loop with the encoder restart after a stall (ADR-0010 outcome item 2), the size
// target's passes (outcome item 7), the abort gate (outcome item 10) and error classification.
import { correctiveBps } from '../core';
import type { EncodedVideo } from './encoder';
import { StageError, StallError, errorText } from './encoder';

/** The parts of the encoder stage the loop uses. */
export interface EncoderLike {
  encode(frame: { close(): void }, keyFrame: boolean): Promise<void>;
  flush(): Promise<void>;
  close(): void;
}

/** Encoder re-creations allowed in one pass before a stall fails the export. */
export const MAX_RESTARTS = 2;

/**
 * Implements: ADR-0010 §1 and outcome item 2 — encodes frames 0…n−1 (a keyframe every `gop`), holding
 * only the current GOP's packets (≈ 2 s) before they go to `deliver`. On a stall the encoder is closed
 * and re-created, the readers are rewound, and encoding restarts at the first frame of the GOP whose
 * packets were not delivered — the next keyframe boundary of the output — so the file has every frame
 * once. After MAX_RESTARTS more stalls the export fails.
 */
export async function encodeFrames<F extends { close(): void }>(o: {
  readonly frames: number;
  readonly gop: number;
  /** Paints frame k and wraps it (the caller's sequential readers must be at or before k). */
  readonly render: (k: number) => Promise<F>;
  readonly createEncoder: (onPacket: (e: EncodedVideo) => void) => EncoderLike;
  /** The output frame index of an encoded packet. */
  readonly frameOf: (e: EncodedVideo) => number;
  readonly deliver: (e: EncodedVideo) => void;
  /** Drops the decoders so decoding restarts from an earlier frame. */
  readonly rewind: () => Promise<void>;
  readonly onFrame?: (k: number) => void;
}): Promise<{ restarts: number; encoder: EncoderLike }> {
  let restarts = 0;
  let gopStart = 0;
  let held: EncodedVideo[] = [];
  let config: VideoDecoderConfig | undefined;
  const onPacket = (e: EncodedVideo): void => {
    const f = o.frameOf(e);
    if (e.packet.key && f > gopStart) {
      for (const h of held) o.deliver(h);
      held = [];
      gopStart = f;
    }
    // The first packet ever carries the decoder config; a re-created encoder's first one is not needed.
    if (e.config) {
      if (config) e = { packet: e.packet };
      else config = e.config;
    }
    held.push(e);
  };
  let enc = o.createEncoder(onPacket);
  for (let k = 0; ;) {
    try {
      for (; k < o.frames; k++) {
        const frame = await o.render(k);
        try {
          await enc.encode(frame, k % o.gop === 0);
        } finally {
          frame.close();
        }
        o.onFrame?.(k);
      }
      await enc.flush();
      for (const h of held) o.deliver(h);
      held = [];
      return { restarts, encoder: enc };
    } catch (e) {
      if (!(e instanceof StallError) || restarts >= MAX_RESTARTS) throw e;
      restarts++;
      try {
        enc.close();
      } catch {
        /* a stalled encoder may already be closed */
      }
      // Restart at the next keyframe boundary of the output: the GOP whose packets were held.
      const from = gopStart;
      held = [];
      await o.rewind();
      enc = o.createEncoder(onPacket);
      k = from;
    }
  }
}

export interface PassResult {
  readonly bytes: number;
  readonly videoBytes: number;
}

/**
 * Implements: RULE-15 / F-015.AC10, ADR-0010 §5 and outcome item 7 — encode at the bitrate; when the
 * file is above the target, one corrective pass at `bitrate × budget ÷ actual × 0.97` (budget = the
 * target minus the sound and overhead of pass 1); a file still above the target fails (`over_target`)
 * and is never handed over.
 */
export async function runTargetPasses(o: {
  readonly bitrate: number;
  readonly targetBytes: number | null;
  readonly pass: (bitrate: number, index: number) => Promise<PassResult>;
  readonly reset: () => void | Promise<void>;
}): Promise<{ bitrates: number[]; result: PassResult }> {
  const bitrates = [o.bitrate];
  let result = await o.pass(o.bitrate, 1);
  if (o.targetBytes === null || result.bytes <= o.targetBytes) return { bitrates, result };
  const next = correctiveBps(o.bitrate, o.targetBytes - (result.bytes - result.videoBytes), result.videoBytes);
  bitrates.push(next);
  await o.reset();
  result = await o.pass(next, 2);
  if (result.bytes > o.targetBytes)
    throw new StageError('over_target', `RangeError: ${result.bytes} bytes over the ${o.targetBytes} target`);
  return { bitrates, result };
}

/**
 * Implements: ADR-0010 outcome item 10, NFR-11 — the abort request may come before, during or after
 * the sink is opened: the registered discard runs at once; a sink opened after an abort is discarded
 * by its opener (`register` returns false). After `export:done` the sink is unregistered, so a late
 * abort never deletes a finished file.
 */
export class AbortGate {
  private discard: (() => Promise<void>) | null = null;
  aborted = false;

  /** Returns false when the export was aborted already (the caller discards and stops). */
  register(discard: () => Promise<void>): boolean {
    if (this.aborted) return false;
    this.discard = discard;
    return true;
  }

  /** The file is handed over: nothing to discard any more. */
  clear(): void {
    this.discard = null;
  }

  async abort(): Promise<void> {
    this.aborted = true;
    const d = this.discard;
    this.discard = null;
    if (d) await d().catch(() => undefined);
  }
}

/** A storage quota error from the sink is COPY-error.no_space (F-019.R7); other sink errors stay `sink`. */
export function sinkError(e: unknown): StageError {
  if (e instanceof StageError) return e;
  const text = errorText(e);
  return new StageError(/QuotaExceeded/i.test(text) ? 'no_space' : 'sink', text);
}

/** Runs `p` posting a liveness beat every `ms` until it settles (phases without frame progress). */
export async function withHeartbeat<T>(p: Promise<T>, beat: () => void, ms = 1000): Promise<T> {
  beat();
  const timer = setInterval(beat, ms);
  try {
    return await p;
  } finally {
    clearInterval(timer);
  }
}
