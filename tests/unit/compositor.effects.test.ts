// MOD-Compositor effects check (RULE-22, ADR-0004 outcome item 9, ADR-0006 outcome rule 7).
import { describe, expect, it } from 'vitest';
import { invariantViolations } from '../../src/core';
import { framePlan } from '../../src/plan';
import { classifyEffects, effectsProject, EFFECTS_FRAMES, EFFECTS_WARMUP, SLOW_FPS } from '../../src/compositor';

describe('RULE-22 effects check', () => {
  it('RULE-22 effects below 30 fps are slow; at or above they are not', () => {
    expect(SLOW_FPS).toBe(30);
    expect(classifyEffects(29.9)).toEqual({ ok: true, fps: 29.9, slow: true });
    expect(classifyEffects(30)).toEqual({ ok: true, fps: 30, slow: false });
  });

  it('RULE-22 the check draws the full chain: every adjustment, a look and the Blur background at 1080p', () => {
    const p = effectsProject();
    expect(invariantViolations(p)).toEqual([]);
    const clip = framePlan(p, 0).layers[0]!.clip;
    expect(Object.keys(clip.adjustments)).toHaveLength(12);
    expect(clip.look?.intensity).toBeGreaterThan(0);
    expect(p.frame.background).toBe('blur');
    expect([EFFECTS_WARMUP, EFFECTS_FRAMES]).toEqual([5, 30]);
  });
});
