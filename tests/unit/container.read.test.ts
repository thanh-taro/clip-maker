// MOD-Container — the read side on the small corpus (tests/fixtures/media, made by SP-license's own
// generator and recorder). Runs in Node: reading needs no codec API; decoding is covered in the
// browser suite (tests/e2e/media-intake.spec.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ContainerError, openInput, type OpenedInput } from '../../src/container';
import { readsOf, virtualFile } from '../support/blobs';

const load = (name: string): Blob => new Blob([readFileSync(new URL(`../fixtures/media/${name}`, import.meta.url))]);

async function withInput<T>(name: string, f: (i: OpenedInput) => Promise<T>): Promise<T> {
  const input = await openInput(load(name));
  try {
    return await f(input);
  } finally {
    input.close();
  }
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'opened';
  } catch (e) {
    expect(e).toBeInstanceOf(ContainerError);
    return (e as ContainerError).code;
  }
}

describe('MOD-Container openInput', () => {
  it('MOD-Container reads tracks, decoder configs, frame rate and duration of an MP4', async () => {
    await withInput('mp4-faststart.mp4', async (i) => {
      expect(i.video?.codec).toMatch(/^avc1\./);
      expect(i.video?.decoderConfig.description).toBeTruthy();
      expect([i.video?.displayWidth, i.video?.displayHeight]).toEqual([320, 240]);
      expect(i.video?.rotation).toBe(0);
      expect(i.video?.frameRate).toBeCloseTo(30, 0);
      expect(i.audio?.codec).toBe('mp4a.40.2');
      expect([i.audio?.sampleRate, i.audio?.channels]).toEqual([48000, 2]);
      expect(i.duration).toBeCloseTo(2.069, 1);
    });
  });

  it('MOD-Container reports rotation from the track matrix with the display size after it', async () => {
    await withInput('mp4-rot90.mp4', async (i) => {
      expect(i.video?.rotation).toBe(90);
      expect([i.video?.codedWidth, i.video?.codedHeight]).toEqual([320, 240]);
      expect([i.video?.displayWidth, i.video?.displayHeight]).toEqual([240, 320]);
    });
  });

  it('MOD-Container leaves edit-list trims as negative timestamps (ADR-0009 outcome 1)', async () => {
    await withInput('mp4-elst-trim.mp4', async (i) => {
      expect(i.video?.firstTimestamp).toBeCloseTo(-2 / 30, 3);
      const first = await i.packetAt('video', 0);
      expect(first?.timestamp).toBeCloseTo(0, 6);
    });
  });

  it('MOD-Container finds the packet presented at a time from the index (t + 2 µs)', async () => {
    await withInput('mp4-faststart.mp4', async (i) => {
      const at = await i.packetAt('video', 1 / 30); // a frame start floored to whole µs still finds frame 1
      expect(at?.timestamp).toBeCloseTo(1 / 30, 6);
      const key = await i.keyPacketAt('video', 1.5);
      expect(key?.key).toBe(true);
      expect(key?.timestamp).toBeCloseTo(1, 6);
      expect(await i.keyframeSpacing()).toBeCloseTo(1, 6);
    });
  });

  it('MOD-Container streams packets in order from the key packet before a time', async () => {
    await withInput('mp4-faststart.mp4', async (i) => {
      const seen: number[] = [];
      for await (const p of i.packets('video', 1.2)) {
        seen.push(p.timestamp);
        expect(p.data.byteLength).toBeGreaterThan(0);
      }
      expect(seen[0]).toBeCloseTo(1, 6);
      expect(seen).toHaveLength(30);
    });
  });

  it('MOD-Container reads WebM, Ogg and FLAC', async () => {
    await withInput('rec-chrome-vp9-opus.webm', async (i) => {
      expect(i.video?.codec).toMatch(/^vp09/);
      expect(i.audio?.codec).toBe('opus');
    });
    await withInput('audio-opus.ogg', async (i) => {
      expect(i.video).toBeNull();
      expect(i.audio?.codec).toBe('opus');
      expect(i.duration).toBeCloseTo(2, 1);
    });
    await withInput('os-afconvert.flac', async (i) => expect(i.audio?.codec).toBe('flac'));
  });

  it('MOD-Container a file without tracks (missing moov) is a typed no_media error (ADR-0005)', async () => {
    expect(await codeOf(openInput(load('dmg-moov-missing.mp4')))).toBe('no_media');
  });

  it('MOD-Container random bytes and damaged tables are refused without hanging', async () => {
    expect(await codeOf(openInput(load('dmg-garbage.mp4')))).toBe('unsupported');
    expect(await codeOf(openInput(load('dmg-bad-stsz.mp4')))).toBe('damaged');
    expect(await codeOf(openInput(new Blob([new Uint8Array(0)])))).toBe('unsupported');
  });

  it('F-001.R7 opening a 3.9 GB file reads only its headers, in slices (NFR-05)', async () => {
    const real = new Uint8Array(readFileSync(new URL('../fixtures/media/mp4-faststart.mp4', import.meta.url)));
    const file = virtualFile(real, 3_900_000_000);
    const input = await openInput(file);
    try {
      expect(input.video?.codec).toMatch(/^avc1\./);
      const first = await input.packetAt('video', 0);
      expect(first?.data.byteLength).toBeGreaterThan(0);
    } finally {
      input.close();
    }
    const reads = readsOf(file);
    const total = reads.reduce((s, [a, b]) => s + (b - a), 0);
    expect(reads.length).toBeGreaterThan(0);
    expect(total).toBeLessThan(8 * 1024 * 1024);
  });
});
