// MOD-Preview — the text-bitmap budget (ADR-0009 §4, NFR-05, build question 172): an LRU by bytes over the
// engine's text bitmaps, layers near the playhead kept, the others rasterised again on a miss.
import { describe, expect, it } from 'vitest';
import type { TextLayer, ToEngine } from '../../src/core';
import { nearPlayhead, TEXT_AHEAD, TextBitmapLru, textSync } from '../../src/preview';
import { BUDGETS } from '../../src/engine/budget';

const S = 1_000_000;
const MB = 1_000_000;

const layer = (id: string, start: number, end: number, content = id): TextLayer =>
  ({
    id,
    content,
    start: start * S,
    end: end * S,
    typeface: 'sans',
    size: 8,
    colour: 'white',
    style: 'plain',
    align: 'centre',
    x: 0.5,
    y: 0.8,
  }) as unknown as TextLayer;

/** A fake bitmap of `bytes` bytes (width × height × 4). */
function fakeBitmap(bytes: number) {
  const b = { width: bytes / 4, height: 1, closed: false, close: () => (b.closed = true) };
  return b;
}

function harness(budget: number, bytes = 10 * MB) {
  const posts: Extract<ToEngine, { type: 'engine:setTextBitmaps' }>[] = [];
  const rasterised: string[] = [];
  const made: ReturnType<typeof fakeBitmap>[] = [];
  const sync = textSync(
    (m) => posts.push(m as Extract<ToEngine, { type: 'engine:setTextBitmaps' }>),
    async (l) => {
      rasterised.push(l.id);
      const b = fakeBitmap(bytes);
      made.push(b);
      return b as unknown as ImageBitmap;
    },
    budget,
  );
  return { sync, posts, rasterised, made };
}

describe('MOD-Preview text-bitmap LRU', () => {
  it('ADR-0009 §4 NFR-05 the budgets are 32 MB on phones and 96 MB on laptops', () => {
    expect(BUDGETS.phone.textBytes).toBe(32 * MB);
    expect(BUDGETS.laptop.textBytes).toBe(96 * MB);
  });

  it('ADR-0009 §4 the least recently used entry is evicted first, until the total fits; pinned ones stay', () => {
    const lru = new TextBitmapLru(30);
    lru.set('a', 10);
    lru.set('b', 10);
    lru.set('c', 10);
    lru.touch('a'); // order now b, c, a
    lru.set('d', 10);
    expect(lru.evict()).toEqual(['b']);
    expect(lru.ids()).toEqual(['c', 'a', 'd']);
    expect(lru.total).toBe(30);
    lru.set('e', 20);
    expect(lru.evict(new Set(['c']))).toEqual(['a', 'd']);
    expect(lru.ids()).toEqual(['c', 'e']);
    expect(lru.total).toBe(30);
  });

  it('ADR-0009 §4 a layer is near when it shows, ended within 1 s, or starts within 5 s', () => {
    const l = layer('x', 10, 12);
    expect(nearPlayhead(l, 11 * S)).toBe(true);
    expect(nearPlayhead(l, 12.5 * S)).toBe(true);
    expect(nearPlayhead(l, 13.5 * S)).toBe(false);
    expect(nearPlayhead(l, 10 * S - TEXT_AHEAD)).toBe(true);
    expect(nearPlayhead(l, 4 * S)).toBe(false);
  });

  it('ADR-0009 §4 NFR-05 only layers near the playhead are rasterised, and the budget is never passed', async () => {
    // 50 layers of 10 MB each, one per 2 s, under a 32 MB (phone) budget.
    const layers = Array.from({ length: 50 }, (_, i) => layer(`t${i}`, i * 2, i * 2 + 2));
    const { sync, rasterised, posts } = harness(32 * MB);
    await sync.update(layers, 1080, 1920, 0);
    // Near 0 s: t0 (showing), t1, t2 (start within 5 s); 30 MB fits.
    expect(rasterised).toEqual(['t0', 't1', 't2']);
    expect(sync.heldBytes()).toBeLessThanOrEqual(32 * MB);
    expect(Object.keys(posts.at(-1)!.bitmaps)).toEqual(['t0', 't1', 't2']);
    for (let t = 0; t <= 98; t += 1) {
      await sync.update(layers, 1080, 1920, t * S);
      expect(sync.heldBytes()).toBeLessThanOrEqual(32 * MB);
    }
  });

  it('ADR-0009 §4 a layer let go is rasterised again on a miss when the playhead comes back near', async () => {
    const layers = [layer('a', 0, 2), layer('b', 20, 22), layer('c', 40, 42)];
    const { sync, rasterised } = harness(20 * MB);
    await sync.update(layers, 1080, 1920, 0);
    await sync.update(layers, 1080, 1920, 20 * S);
    await sync.update(layers, 1080, 1920, 40 * S); // a (least recent) is let go
    expect(sync.held()).toEqual(['b', 'c']);
    expect(rasterised).toEqual(['a', 'b', 'c']);
    await sync.update(layers, 1080, 1920, 1 * S); // miss: a again, b goes
    expect(rasterised).toEqual(['a', 'b', 'c', 'a']);
    expect(sync.held()).toEqual(['c', 'a']);
    // Nothing changed near the playhead: no work.
    await sync.update(layers, 1080, 1920, 1.5 * S);
    expect(rasterised).toHaveLength(4);
  });

  it('ADR-0009 §4 the engine is told to drop evicted bitmaps (not kept), and a bitmap evicted at once is closed, never sent', async () => {
    const layers = [layer('a', 0, 10), layer('b', 1, 10), layer('c', 2, 10)];
    const { sync, posts, made } = harness(15 * MB);
    await sync.update(layers, 1080, 1920, 0);
    // a shows (pinned); b and c start within 5 s; only one 10 MB bitmap fits beside a's... a is pinned.
    const last = posts.at(-1)!;
    expect(Object.keys(last.bitmaps)).toEqual(['a']);
    expect(made.filter((b) => b.closed)).toHaveLength(2);
    expect(sync.heldBytes()).toBe(10 * MB);
  });

  it('ADR-0009 §4 layers showing at the playhead stay even past the budget', async () => {
    const layers = [layer('a', 0, 10), layer('b', 0, 10), layer('c', 0, 10)];
    const { sync } = harness(15 * MB);
    await sync.update(layers, 1080, 1920, 1 * S);
    expect(sync.held().sort()).toEqual(['a', 'b', 'c']);
  });

  it('F-010.R5 without a playhead every layer is rasterised (no window), as before', async () => {
    const layers = [layer('a', 0, 1), layer('b', 50, 51)];
    const { sync, rasterised } = harness(Number.POSITIVE_INFINITY);
    await sync.update(layers, 100, 100);
    expect(rasterised).toEqual(['a', 'b']);
  });
});
