// MOD-Container — serves a source's encoded sound in pieces over a MessagePort (MOD-Core sound feed),
// from the worker that holds the reader (the engine worker for the preview, the export worker for
// exports) to the worker that decodes and mixes (MOD-Audio). Each stream reads `Blob.slice` ranges
// through the opened input, ≈ 0.5 s of packets per batch, so no file is ever read whole (NFR-05).
// Implements: ADR-0008 §2/§6 (windowed decoding: the reading part), F-001.R7, NFR-05.
import type { FeedPacket, FeedReply, FeedRequest } from '../core';
import { openInput, type OpenedInput, type Packet } from './index';

/** Packets per batch are cut at this much sound… */
export const FEED_BATCH_SECONDS = 0.5;
/** …or at this many packets. */
export const FEED_BATCH_PACKETS = 96;
/** Opened inputs kept (least recently used is closed). */
const OPEN_INPUTS = 6;

export interface FeedPort {
  postMessage(m: FeedReply, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<FeedRequest>) => void) | null;
  start?(): void;
}

interface Stream {
  readonly sourceId: string;
  iter: AsyncIterator<Packet> | null;
  /** The last request's work: requests of a stream run in order. */
  busy: Promise<void>;
  closed: boolean;
}

const text = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

export interface SoundServer {
  /** A source's file arrived: streams waiting for it start. */
  added(sourceId: string): void;
  /** A source left the session: its input is closed (and waiting streams fail). */
  forget(sourceId: string): void;
  close(): void;
}

/**
 * Answers sound-feed requests for the files `fileOf` knows. With `wait`, a stream of a source whose
 * file has not arrived yet waits for `added` (the preview: the project reaches the audio worker before
 * the engine has the new source's file); without it, it fails at once (an export has every file).
 */
export function serveSound(
  port: FeedPort,
  fileOf: (sourceId: string) => Blob | undefined,
  { wait = false, open = openInput }: { wait?: boolean; open?: (file: Blob) => Promise<OpenedInput> } = {},
): SoundServer {
  const inputs = new Map<string, Promise<OpenedInput>>();
  const streams = new Map<number, Stream>();
  const waiting = new Map<string, { ok: (f: Blob) => void; fail: (e: Error) => void }[]>();
  const fileFor = (id: string): Promise<Blob> => {
    const file = fileOf(id);
    if (file) return Promise.resolve(file);
    if (!wait) return Promise.reject(new Error(`NotFoundError: source ${id} not given`));
    return new Promise<Blob>((ok, fail) => waiting.set(id, [...(waiting.get(id) ?? []), { ok, fail }]));
  };
  const inputOf = (id: string): Promise<OpenedInput> => {
    let p = inputs.get(id);
    if (p)
      inputs.delete(id); // re-inserted: most recently used last
    else {
      p = fileFor(id).then(open);
      p.catch(() => inputs.delete(id));
    }
    inputs.set(id, p);
    // The least recently used inputs go first; one with an open stream is never closed.
    for (const [old, q] of inputs) {
      if (inputs.size <= OPEN_INPUTS) break;
      if (old === id || [...streams.values()].some((x) => x.sourceId === old)) continue;
      inputs.delete(old);
      void q.then((i) => i.close()).catch(() => undefined);
    }
    return p;
  };
  const forget = (id: string): void => {
    for (const w of waiting.get(id) ?? []) w.fail(new Error(`NotFoundError: source ${id} left`));
    waiting.delete(id);
    for (const s of streams.values()) if (s.sourceId === id) s.closed = true;
    const p = inputs.get(id);
    inputs.delete(id);
    void p?.then((i) => i.close()).catch(() => undefined);
  };
  /** Up to a batch of packets; `head` goes first (the packet read to check where the stream starts). */
  const batch = async (id: number, s: Stream, extra: object, head: Packet | null): Promise<void> => {
    const packets: FeedPacket[] = [];
    let span = 0;
    let done = false;
    let next: Packet | null = head;
    for (;;) {
      if (!next) {
        const r = s.iter ? await s.iter.next() : { done: true as const, value: undefined };
        if (r.done) {
          done = true;
          break;
        }
        next = r.value;
      }
      // A copy: the reader's bytes may be a view of a larger buffer it keeps.
      packets.push({ t: next.timestamp, d: next.duration, data: next.data.slice() });
      span += next.duration;
      next = null;
      if (s.closed || span >= FEED_BATCH_SECONDS || packets.length >= FEED_BATCH_PACKETS) break;
    }
    if (s.closed) return;
    port.postMessage(
      { type: 'batch', id, ...extra, packets, done },
      packets.map((p) => p.data.buffer),
    );
    if (done) streams.delete(id);
  };
  const run = (id: number, s: Stream, f: () => Promise<void>): void => {
    s.busy = s.busy.then(f).catch((e: unknown) => {
      streams.delete(id);
      if (!s.closed) port.postMessage({ type: 'error', id, message: text(e) });
    });
  };
  port.onmessage = (e: MessageEvent<FeedRequest>) => {
    const m = e.data;
    if (m.type === 'open') {
      const s: Stream = { sourceId: m.sourceId, iter: null, busy: Promise.resolve(), closed: false };
      streams.set(m.id, s);
      run(m.id, s, async () => {
        const input = await inputOf(m.sourceId);
        const audio = input.audio;
        if (!audio) {
          streams.delete(m.id);
          port.postMessage({ type: 'batch', id: m.id, config: null, packets: [], done: true });
          return;
        }
        s.iter = input.packets('audio', m.from)[Symbol.asyncIterator]();
        const r = await s.iter.next();
        const head = r.done ? null : r.value;
        // A stream from the track's first packet needs no codec pre-roll (decoding starts as from 0).
        const first = !head || head.timestamp <= audio.firstTimestamp + 1e-9;
        await batch(m.id, s, { config: audio.decoderConfig, first, start: audio.firstTimestamp }, head);
      });
    } else if (m.type === 'more') {
      const s = streams.get(m.id);
      if (s) run(m.id, s, () => batch(m.id, s, {}, null));
    } else {
      const s = streams.get(m.id);
      streams.delete(m.id);
      if (!s) return;
      s.closed = true;
      void s.busy.then(() => s.iter?.return?.()).catch(() => undefined);
    }
  };
  port.start?.();
  return {
    added: (id) => {
      const file = fileOf(id);
      if (!file) return;
      for (const w of waiting.get(id) ?? []) w.ok(file);
      waiting.delete(id);
    },
    forget,
    close: () => {
      waiting.clear();
      port.onmessage = null;
      for (const s of streams.values()) s.closed = true;
      streams.clear();
      for (const p of inputs.values()) void p.then((i) => i.close()).catch(() => undefined);
      inputs.clear();
    },
  };
}
