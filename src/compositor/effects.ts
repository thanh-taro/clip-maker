// MOD-Compositor — the timed effects check of RULE-22 (ADR-0004 outcome item 9, ADR-0006 outcome
// rule 7): the full RULE-08 chain, a look and the Blur background at 1080p on a generated bitmap,
// 5 warm-up and 30 timed frames with one GPU sync at the end; slow below 30 fps.
// Implements: F-023.R1 (effects part), RULE-22.
import { DEFAULT_PLACEMENT, type Adjustments, type Clip, type Project } from '../core';
import { framePlan } from '../plan';
import { createCompositor } from './compositor';
import { identityTable, type LookTable } from './lut';

export const EFFECTS_WIDTH = 1920;
export const EFFECTS_HEIGHT = 1080;
export const EFFECTS_WARMUP = 5;
export const EFFECTS_FRAMES = 30;
/** RULE-22 speed threshold set in 40-technical (architecture.md, ADR-0004 item 9). */
export const SLOW_FPS = 30;

export interface EffectsResult {
  readonly ok: boolean;
  readonly fps: number;
  readonly slow: boolean;
}

/** Every adjustment away from its default (RULE-08), Grain included. */
const ALL_ON: Adjustments = {
  temperature: 20,
  tint: -10,
  brightness: 10,
  contrast: 20,
  highlights: -20,
  shadows: 20,
  saturation: 15,
  vibrance: 20,
  sharpen: 40,
  vignette: 30,
  grain: 20,
  fade: 10,
};

/** A non-identity table: the identity with its channels swapped (enough to exercise the 3D lookup). */
function testTable(): LookTable {
  const t = identityTable();
  for (let i = 0; i < t.length; i += 4) {
    const r = t[i]!;
    t[i] = t[i + 2]!;
    t[i + 2] = r;
  }
  return t;
}

/** The one-clip project the check draws (photo clip, Blur background, a look at 80 %). */
export function effectsProject(): Project {
  const clip: Clip = {
    id: 'effects',
    sourceId: 'effects',
    kind: 'photo',
    duration: 3_000_000,
    placement: DEFAULT_PLACEMENT,
    adjustments: ALL_ON,
    look: { id: 'effects', intensity: 80 },
    fadeIn: 0,
    fadeOut: 0,
    crossFadeNext: 0,
  };
  return {
    frame: { aspect: '16:9', frameRate: 30, background: 'blur' },
    sources: [{ id: 'effects', kind: 'photo', name: 'effects', bytes: 1, width: 1440, height: 1080 }],
    clips: [clip],
    textLayers: [],
    audioClips: [],
  };
}

/** Classifies a measured rate (pure). */
export const classifyEffects = (fps: number): EffectsResult => ({ ok: true, fps, slow: fps < SLOW_FPS });

/**
 * Implements: RULE-22 effects check. Resolves `{ ok: false }` when the device cannot draw the chain at
 * all (no WebGL2, no 3D textures, a shader that does not compile). `onDrawn(true)` comes as soon as the
 * first warm-up frame has drawn and synced (≈ 100 ms); `onDrawn(false)` if it never could.
 */
export async function effectsCheck(onDrawn?: (ok: boolean) => void): Promise<EffectsResult> {
  let told = false;
  const tell = (ok: boolean) => {
    if (told) return;
    told = true;
    onDrawn?.(ok);
  };
  const result = await timedCheck(() => tell(true));
  tell(result.ok);
  return result;
}

async function timedCheck(drawn: () => void): Promise<EffectsResult> {
  try {
    const source = new OffscreenCanvas(1440, 1080);
    const g = source.getContext('2d');
    if (!g) return { ok: false, fps: 0, slow: true };
    const grad = g.createLinearGradient(0, 0, 1440, 1080);
    grad.addColorStop(0, '#203060');
    grad.addColorStop(0.5, '#c08040');
    grad.addColorStop(1, '#f0f0e0');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1440, 1080);
    const bitmap = await createImageBitmap(source);
    const canvas = new OffscreenCanvas(EFFECTS_WIDTH, EFFECTS_HEIGHT);
    const comp = createCompositor(canvas, new Map([['effects', testTable()]]));
    try {
      const project = effectsProject();
      const frame = { image: bitmap, width: bitmap.width, height: bitmap.height, rotation: 0 as const };
      // The first warm-up frame, synced: the chain compiled and drew (F-023, the opening-screen answer).
      comp.paint(framePlan(project, 0), [frame]);
      comp.sync();
      drawn();
      for (let i = 1; i < EFFECTS_WARMUP; i++) comp.paint(framePlan(project, i), [frame]);
      comp.sync();
      const t0 = performance.now();
      for (let i = 0; i < EFFECTS_FRAMES; i++) comp.paint(framePlan(project, EFFECTS_WARMUP + i), [frame]);
      comp.sync();
      const ms = performance.now() - t0;
      return classifyEffects((EFFECTS_FRAMES * 1000) / Math.max(ms, 0.001));
    } finally {
      comp.dispose();
      bitmap.close();
    }
  } catch {
    return { ok: false, fps: 0, slow: true };
  }
}
