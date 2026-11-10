// MOD-Container — the sound feed's reading side (`serveSound`, ADR-0008 §6) with a fake opened input:
// batches of ≈ 0.5 s in decode order from the packet at a time, the track's config and "first packet"
// flag on the first batch, copies of the bytes, errors and closing.
import { describe, expect, it } from 'vitest';
import { serveSound, type OpenedInput, type Packet } from '../../src/container';
import type { FeedReply, FeedRequest } from '../../src/core';

const DUR = 1024 / 48_000;

function fakeInput(count: number, opened: { closed: number }): OpenedInput {
  const backing = new Uint8Array(count * 4);
  const packet = (i: number): Packet => ({
    timestamp: (i - 2) * DUR, // two priming packets before time 0 (an edit list)
    duration: DUR,
    key: true,
    data: backing.subarray(i * 4, i * 4 + 4).fill(i),
  });
  return {
    format: 'MP4',
    duration: (count - 2) * DUR,
    video: null,
    audio: {
      id: 2,
      codec: 'mp4a.40.2',
      decoderConfig: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2 },
      sampleRate: 48_000,
      channels: 2,
      firstTimestamp: -2 * DUR,
    },
    async *packets(_kind, from = -Infinity) {
      const start = from === -Infinity ? 0 : Math.max(0, Math.floor(from / DUR + 2 + 1e-9));
      for (let i = start; i < count; i++) yield packet(i);
    },
    packetAt: async () => null,
    keyPacketAt: async () => null,
    keyframeSpacing: async () => null,
    close: () => void opened.closed++,
  };
}

function rig(count = 200, wait = false, files: Record<string, Blob> = { 'src-a': new Blob([]) }) {
  const replies: FeedReply[] = [];
  const transfers: Transferable[][] = [];
  const port = {
    onmessage: null as ((e: MessageEvent<FeedRequest>) => void) | null,
    postMessage: (m: FeedReply, t: Transferable[] = []) => (replies.push(m), transfers.push(t)),
  };
  const opened = { count: 0, closed: 0 };
  const server = serveSound(port, (id) => files[id], {
    wait,
    open: async () => (opened.count++, fakeInput(count, opened)),
  });
  const send = async (m: FeedRequest) => {
    port.onmessage?.({ data: m } as MessageEvent<FeedRequest>);
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  };
  return { replies, transfers, send, opened, server };
}

const batch = (r: FeedReply) => r as Extract<FeedReply, { type: 'batch' }>;

describe('MOD-Container sound feed (ADR-0008 §6)', () => {
  it('ADR-0008 §6 NFR-05 a stream sends ≈ 0.5 s batches from the packet at a time, with the config and copied bytes', async () => {
    const { replies, transfers, send, opened } = rig();
    await send({ type: 'open', id: 1, sourceId: 'src-a', from: 1.0 });
    const first = batch(replies[0]!);
    expect(first.config?.codec).toBe('mp4a.40.2');
    expect(first.first).toBe(false);
    expect(first.packets[0]!.t).toBeLessThanOrEqual(1.0);
    expect(first.packets[0]!.t + DUR).toBeGreaterThan(1.0);
    const span = first.packets.length * DUR;
    expect(span).toBeGreaterThanOrEqual(0.5);
    expect(span).toBeLessThan(0.5 + DUR);
    expect(first.packets[0]!.data.buffer.byteLength).toBe(4); // a copy, not the reader's buffer
    expect(transfers[0]).toHaveLength(first.packets.length);
    await send({ type: 'more', id: 1 });
    const second = batch(replies[1]!);
    expect(second.config).toBeUndefined();
    expect(second.packets[0]!.t).toBeCloseTo(first.packets.at(-1)!.t + DUR, 9);
    // A second stream of the same source reuses the opened input.
    await send({ type: 'open', id: 2, sourceId: 'src-a', from: -Infinity });
    expect(batch(replies[2]!).first).toBe(true);
    expect(batch(replies[2]!).packets[0]!.t).toBeCloseTo(-2 * DUR, 9);
    expect(opened.count).toBe(1);
  });

  it('ADR-0008 §6 the last batch says done; an unknown source is an error; forget closes the input', async () => {
    const { replies, send, opened, server } = rig(30);
    await send({ type: 'open', id: 1, sourceId: 'src-a', from: 0.3 });
    expect(batch(replies[0]!).done).toBe(true);
    await send({ type: 'open', id: 2, sourceId: 'nope', from: 0 });
    expect(replies[1]).toMatchObject({ type: 'error', id: 2 });
    expect((replies[1] as { message: string }).message).toMatch(/NotFoundError/);
    server.forget('src-a');
    await send({ type: 'close', id: 1 });
    expect(opened.closed).toBe(1);
  });

  it('ADR-0008 §6 in the preview a stream of a source whose file has not arrived waits for it', async () => {
    const files: Record<string, Blob> = {};
    const { replies, send, server } = rig(200, true, files);
    await send({ type: 'open', id: 1, sourceId: 'src-b', from: 0 });
    expect(replies).toEqual([]);
    files['src-b'] = new Blob([]);
    server.added('src-b');
    await send({ type: 'more', id: 99 }); // lets the waiting stream run
    expect(batch(replies[0]!).packets.length).toBeGreaterThan(0);
    // A source that leaves while waited for ends its stream quietly (the audio worker dropped it too).
    await send({ type: 'open', id: 2, sourceId: 'src-c', from: 0 });
    server.forget('src-c');
    files['src-c'] = new Blob([]);
    server.added('src-c');
    await send({ type: 'more', id: 99 });
    expect(replies).toHaveLength(1);
  });

  it('NFR-05 a file with an open stream is never closed to make room: the 7th source does not end the music', async () => {
    const files = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`src-${i}`, new Blob([])]));
    const { replies, send, opened } = rig(2000, false, files);
    await send({ type: 'open', id: 100, sourceId: 'src-0', from: 0 }); // the music, still playing
    for (let i = 1; i <= 7; i++) {
      await send({ type: 'open', id: i, sourceId: `src-${i}`, from: 0 });
      await send({ type: 'close', id: i });
    }
    expect(opened.count).toBe(8);
    expect(opened.closed).toBe(2); // two closed sources made room, never src-0
    await send({ type: 'more', id: 100 });
    const last = replies.at(-1)!;
    expect(last).toMatchObject({ type: 'batch', id: 100 });
    expect(batch(last).packets.length).toBeGreaterThan(0);
  });
});
