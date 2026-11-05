// MOD-Engine bounded caches and device budgets (ADR-0009 §4 and outcome rules 4, 5, 7).
import { describe, expect, it } from 'vitest';
import { BUDGETS, CoarseCache, deviceClass, keepsCoarse } from '../../src/engine';

class Item {
  closed = false;
  close(): void {
    this.closed = true;
  }
}

describe('ADR-0009 outcome rule 4: coarse frames for long-GOP sources', () => {
  it('MOD-Engine only sources with keyframes more than 2 s apart keep coarse frames', () => {
    expect(keepsCoarse(10)).toBe(true);
    expect(keepsCoarse(2)).toBe(false);
    expect(keepsCoarse(null)).toBe(false);
  });

  it('MOD-Engine about one frame per second is kept, at most the cap, the farthest dropped and closed', () => {
    const c = new CoarseCache<Item>(3);
    const items = [0, 1, 2, 3].map(() => new Item());
    c.add(0, items[0]!);
    expect(c.wants(500_000)).toBe(false);
    expect(c.wants(1_000_000)).toBe(true);
    c.add(1_000_000, items[1]!);
    c.add(2_000_000, items[2]!);
    c.add(3_000_000, items[3]!); // full: 0 is farthest from 3 s
    expect(c.size).toBe(3);
    expect(items[0]!.closed).toBe(true);
    const dup = new Item();
    c.add(3_100_000, dup);
    expect(dup.closed).toBe(true);
    expect(c.size).toBe(3);
  });

  it('NFR-03 the nearest kept frame at or before a scrub target is served first', () => {
    const c = new CoarseCache<Item>(32);
    for (const t of [0, 1_000_000, 2_000_000]) c.add(t, new Item());
    expect(c.nearest(1_500_000)?.t).toBe(1_000_000);
    expect(c.nearest(-5)?.t).toBe(0);
    c.clear();
    expect(c.nearest(1)).toBeNull();
  });
});

describe('ADR-0009 device budgets', () => {
  it('MOD-Engine phones get 3 decoders and laptops 4, with 12 frames each', () => {
    expect(BUDGETS.phone.decoders).toBe(3);
    expect(BUDGETS.laptop.decoders).toBe(4);
    expect(BUDGETS.phone.framesPerDecoder).toBe(12);
    expect(BUDGETS.laptop.framesPerDecoder).toBe(12);
    expect(BUDGETS.phone.coarsePerSource).toBe(32);
    expect(BUDGETS.phone.thumbnailBytes).toBe(24_000_000);
    expect(BUDGETS.laptop.textBytes).toBe(96_000_000);
  });

  it('MOD-Engine the device class comes from the platform', () => {
    expect(deviceClass({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })).toBe('phone');
    expect(deviceClass({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' })).toBe('phone');
    expect(deviceClass({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(
      'phone',
    );
    expect(deviceClass({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe(
      'laptop',
    );
    expect(deviceClass({ userAgent: 'X11; Linux x86_64', mobile: true })).toBe('phone');
    expect(deviceClass({ userAgent: 'Windows NT 10.0', deviceMemory: 4 })).toBe('phone');
    expect(deviceClass({ userAgent: 'Windows NT 10.0', deviceMemory: 8 })).toBe('laptop');
  });
});
