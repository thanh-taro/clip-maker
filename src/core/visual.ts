// MOD-Core — placement geometry, adjustments and looks (RULE-04 Original aspect, RULE-07, RULE-08, RULE-09).
import type { Adjustments, Clip, Look, Placement, Project, Source } from './project.gen';
import { RULE_07, RULE_08, RULE_09 } from './limits';

/** Implements: RULE-07 defaults (Reset returns here). */
export const DEFAULT_PLACEMENT: Placement = /* @__PURE__ */ Object.freeze({
  mode: 'fit',
  scale: RULE_07.defaultScale,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
});

/** Implements: RULE-08 defaults (every adjustment at 0). */
export const DEFAULT_ADJUSTMENTS: Adjustments = /* @__PURE__ */ Object.freeze({});

export type AdjustmentName = keyof Adjustments;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Implements: RULE-07 scale 50–400 % in 1 % steps; rotation in 90° steps. */
export function clampPlacement(p: Placement): Placement {
  const scale = clamp(Math.round(p.scale), RULE_07.minScale, RULE_07.maxScale);
  const rotation = ((((Math.round(p.rotation / 90) * 90) % 360) + 360) % 360) as Placement['rotation'];
  return scale === p.scale && rotation === p.rotation ? p : { ...p, scale, rotation };
}

/** Implements: RULE-07 rotate one 90° clockwise step. */
export const rotateClockwise = (r: Placement['rotation']): Placement['rotation'] =>
  ((r + 90) % 360) as Placement['rotation'];

/** Implements: RULE-08 ranges (whole steps). Values at default are dropped, so {} means all default. */
export function clampAdjustments(a: Adjustments): Adjustments {
  const out: Record<string, number> = {};
  for (const name of RULE_08.bipolar) {
    const v = a[name];
    if (v !== undefined) out[name] = clamp(Math.round(v), RULE_08.bipolarMin, RULE_08.bipolarMax);
  }
  for (const name of RULE_08.unipolar) {
    const v = a[name];
    if (v !== undefined) out[name] = clamp(Math.round(v), RULE_08.unipolarMin, RULE_08.unipolarMax);
  }
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out as Adjustments;
}

/** Implements: RULE-09 intensity 0–100. */
export function clampLook(look: Look): Look {
  if (look === null) return null;
  const intensity = clamp(Math.round(look.intensity), RULE_09.minIntensity, RULE_09.maxIntensity);
  return intensity === look.intensity ? look : { ...look, intensity };
}

/** A clip's picture size as displayed: the source's size, swapped by a 90° or 270° rotation (RULE-07). */
export function displayedSize(clip: Clip, source: Source | undefined): { width: number; height: number } | null {
  if (!source?.width || !source.height) return null;
  const sideways = clip.placement.rotation === 90 || clip.placement.rotation === 270;
  return sideways ? { width: source.height, height: source.width } : { width: source.width, height: source.height };
}

const ASPECTS = { '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 } as const;

/**
 * Implements: RULE-04 aspect as width ÷ height. Original takes the shape of the first main-track video
 * clip as displayed (with its rotation), else the first photo (D-015); 16:9 with an empty main track.
 */
export function frameAspect(project: Project): number {
  const { aspect } = project.frame;
  if (aspect !== 'original') return ASPECTS[aspect];
  const first =
    project.clips.find((c) => c.kind === 'video') ?? project.clips.find((c) => c.kind === 'photo') ?? undefined;
  const size = first
    ? displayedSize(
        first,
        project.sources.find((s) => s.id === first.sourceId),
      )
    : null;
  return size ? size.width / size.height : ASPECTS['16:9'];
}

/**
 * Implements: RULE-07 geometry. The clip's drawn size and centre in frame pixels: Fit (whole clip
 * visible) or Fill (covers the frame), computed on the rotated clip, times the scale; the centre is
 * offset from the frame's centre in fractions of the frame's width and height.
 */
export function placedRect(
  frameW: number,
  frameH: number,
  clipW: number,
  clipH: number,
  p: Placement,
): { cx: number; cy: number; width: number; height: number } {
  const sideways = p.rotation === 90 || p.rotation === 270;
  const w = sideways ? clipH : clipW;
  const h = sideways ? clipW : clipH;
  const base = p.mode === 'fit' ? Math.min(frameW / w, frameH / h) : Math.max(frameW / w, frameH / h);
  const k = (base * p.scale) / 100;
  return { cx: frameW / 2 + p.offsetX * frameW, cy: frameH / 2 + p.offsetY * frameH, width: w * k, height: h * k };
}
