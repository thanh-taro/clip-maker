// MOD-Preview — the engine's text bitmaps kept in step with the project (ADR-0012 §3): only changed layers
// are rasterised again; the others are kept by id; a superseded rasterisation is closed, never sent.
import { describe, expect, it } from 'vitest';
import type { TextLayer, ToEngine } from '../../src/core';
import { textSync } from '../../src/preview';
import { text } from '../support/project';

class FakeBitmap {
  closed = false;
  constructor(readonly label: string) {}
  close(): void {
    this.closed = true;
  }
}

function setup() {
  const posts: Extract<ToEngine, { type: 'engine:setTextBitmaps' }>[] = [];
  const made: FakeBitmap[] = [];
  const rasterised: string[] = [];
  const sync = textSync(
    (m) => posts.push(m as Extract<ToEngine, { type: 'engine:setTextBitmaps' }>),
    async (l: TextLayer, W: number) => {
      rasterised.push(`${l.id}:${l.content}@${W}`);
      if (!l.content.trim()) return null;
      const b = new FakeBitmap(l.content);
      made.push(b);
      return b as unknown as ImageBitmap;
    },
  );
  return { posts, made, rasterised, sync };
}

describe('MOD-Preview text bitmaps for the engine', () => {
  it('ADR-0012 §3 F-010.R5 only layers whose pixels changed are rasterised; the rest are kept by id', async () => {
    const { posts, rasterised, sync } = setup();
    const a = text('A', 0, 3, { content: 'Đà Lạt' });
    const b = text('B', 0, 3, { content: 'Hi' });
    await sync.update([a, b], 640, 360);
    expect(rasterised).toEqual(['A:Đà Lạt@640', 'B:Hi@640']);
    expect(Object.keys(posts[0]!.bitmaps)).toEqual(['A', 'B']);
    expect(posts[0]!.bitmaps['A']!.s).toBe(360);
    // Moving B and retiming it changes no pixels: nothing is posted.
    await sync.update([a, { ...b, x: 0.2, start: 1 }], 640, 360);
    expect(posts).toHaveLength(1);
    // Typing into A: only A is rasterised again, B is kept.
    await sync.update([{ ...a, content: 'Đà Lạt!' }, b], 640, 360);
    expect(rasterised.at(-1)).toBe('A:Đà Lạt!@640');
    expect(Object.keys(posts[1]!.bitmaps)).toEqual(['A']);
    expect(posts[1]!.keep).toEqual(['B']);
    // A removed: nothing new, B kept, A dropped by the engine.
    await sync.update([b], 640, 360);
    expect(posts[2]).toEqual({ type: 'engine:setTextBitmaps', bitmaps: {}, keep: ['B'] });
    // A resize rasterises everything again.
    await sync.update([b], 1280, 720);
    expect(rasterised.at(-1)).toBe('B:Hi@1280');
  });

  it('ADR-0012 §3 empty text has no bitmap', async () => {
    const { posts, sync } = setup();
    await sync.update([text('A', 0, 3, { content: '  ' })], 640, 360);
    expect(posts[0]!.bitmaps).toEqual({});
    expect(posts[0]!.keep).toEqual([]);
  });

  it('ADR-0012 §3 results post in the order of the changes: one finishing after a later one posted is closed, never sent', async () => {
    const posts: Extract<ToEngine, { type: 'engine:setTextBitmaps' }>[] = [];
    const pending: ((b: ImageBitmap) => void)[] = [];
    const made: FakeBitmap[] = [];
    const sync = textSync(
      (m) => posts.push(m as Extract<ToEngine, { type: 'engine:setTextBitmaps' }>),
      (l) =>
        new Promise<ImageBitmap | null>((resolve) => {
          const b = new FakeBitmap(l.content);
          made.push(b);
          pending.push(resolve as (b: ImageBitmap) => void);
        }),
    );
    const first = sync.update([text('A', 0, 3, { content: 'H' })], 640, 360);
    const second = sync.update([text('A', 0, 3, { content: 'He' })], 640, 360);
    const third = sync.update([text('A', 0, 3, { content: 'Hel' })], 640, 360);
    // The first finishes first: still the newest result, it shows while typing goes on.
    pending[0]!(made[0] as unknown as ImageBitmap);
    await first;
    expect(posts.map((m) => m.bitmaps['A']!.bitmap)).toEqual([made[0]]);
    // The third finishes before the second: the second is closed when it comes.
    pending[2]!(made[2] as unknown as ImageBitmap);
    await third;
    pending[1]!(made[1] as unknown as ImageBitmap);
    await second;
    expect(posts.map((m) => m.bitmaps['A']!.bitmap)).toEqual([made[0], made[2]]);
    expect(made[1]!.closed).toBe(true);
  });

  it('ADR-0012 §3 when rasterising fails partway, the bitmaps already made are closed', async () => {
    const posts: unknown[] = [];
    const made: FakeBitmap[] = [];
    const sync = textSync(
      (m) => posts.push(m),
      async (l) => {
        if (l.id === 'B') throw new Error('canvas too large');
        const b = new FakeBitmap(l.content);
        made.push(b);
        return b as unknown as ImageBitmap;
      },
    );
    await expect(sync.update([text('A', 0, 3), text('B', 0, 3)], 640, 360)).rejects.toThrow('canvas too large');
    expect(made[0]!.closed).toBe(true);
    expect(posts).toEqual([]);
  });
});
