// MOD-Compositor — plan → draw list (pure): everything the GPU passes need for one output frame,
// computed without WebGL so it is unit- and property-tested (ADR-0006 §1 and §3; outcome rule 2).
// All sizes are relative to the target, so the same plan renders at any resolution.
// Implements: RULE-04 (background colour or Blur; fades to the background colour, or to black with
// Blur), RULE-07 (Fit/Fill on the rotated clip, scale, position, 90° rotation, flips), RULE-08 (grade
// uniforms; sharpen radius and grain cell relative to s), RULE-10 (fade opacity, cross-fade weights),
// F-010.R5 (text bitmaps drawn at the output scale), F-007.R7 (compare: one clip without grade or look).
import { PALETTE_HEX, placedRect, type Frame, type Placement } from '../core';
import type { FramePlan } from '../plan';
import { clipHash, gradeUniforms, grainCell, NEUTRAL, type GradeUniforms, type Rgb } from './grade';

export type Rotation = 0 | 90 | 180 | 270;

/** What paint knows of each layer's picture: its uploaded size and the container's rotation. */
export interface SourceSize {
  readonly width: number;
  readonly height: number;
  /** Rotation stored in the container (applied before the user's RULE-07 rotation). */
  readonly rotation: Rotation;
}

/** Four corners (top-left, top-right, bottom-left, bottom-right) as a triangle strip. */
export interface Quad {
  /** Clip-space positions, y up: [x, y] × 4. */
  readonly pos: readonly number[];
  /** Texture coordinates, v = 0 at the picture's first row: [u, v] × 4. */
  readonly tex: readonly number[];
}

export interface LayerDraw {
  readonly clipId: string;
  readonly grade: GradeUniforms;
  /** The clip placed in the frame. */
  readonly quad: Quad;
  /** Grade intermediate (outcome rule 2: the clip's placed size on this target, never the source size). */
  readonly intermediate: { readonly width: number; readonly height: number; readonly taps: 1 | 4 };
  /** Sharpen tap offset in intermediate texture units (radius relative to s). */
  readonly sharpenStep: readonly [number, number];
  /** Blur background (RULE-04): the clip covering the frame, or null for a colour background. */
  readonly blur: Quad | null;
  readonly weight: number;
  readonly opacity: number;
  /** Grain inputs (ADR-0006 §4). */
  readonly frame: number;
  readonly clip: number;
  /**
   * The clip's frame is not available: the layer is its background only (colour, or black under
   * Blur), still weighted, so a cross-fade never darkens or brightens the picture.
   */
  readonly blank: boolean;
}

export interface TextDraw {
  readonly id: string;
  readonly quad: Quad;
  readonly opacity: number;
}

export interface DrawList {
  readonly width: number;
  readonly height: number;
  /** The output's shorter side (RULE-08 "s"). */
  readonly s: number;
  /** Seen where no clip covers a layer (black under Blur). */
  readonly background: Rgb;
  /** What a fade moves toward: the background colour, or black with Blur (RULE-04, RULE-10). */
  readonly fadeTo: Rgb;
  readonly grainCell: number;
  readonly layers: readonly LayerDraw[];
  readonly texts: readonly TextDraw[];
}

export interface DrawOptions {
  /** RULE-08 compare hold: this clip is drawn without adjustments and look (preview only). */
  readonly compare?: string | null;
}

const BLACK: Rgb = [0, 0, 0];
/** Sharpen radius in output pixels per unit of s (SP-gpu-color). */
const SHARPEN_RADIUS = 0.0012;

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** RULE-04 background as a colour (black under Blur). */
export function backgroundColour(frame: Frame): Rgb {
  return frame.background === 'blur' ? BLACK : hexToRgb(PALETTE_HEX[frame.background]);
}

/**
 * Implements: RULE-07 — the quad of a picture of `size` placed with `p` in a W × H target. The
 * container rotation and the user's rotation turn the picture clockwise; flips mirror it as displayed.
 */
export function placeQuad(W: number, H: number, size: SourceSize, p: Placement): Quad & { extent: [number, number] } {
  const turn = ((size.rotation + p.rotation) % 360) as Rotation;
  const shown = size.rotation % 180 ? { w: size.height, h: size.width } : { w: size.width, h: size.height };
  const r = placedRect(W, H, shown.w, shown.h, p);
  const pos: number[] = [];
  const tex: number[] = [];
  for (const [a, b] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    const x = r.cx - r.width / 2 + a * r.width;
    const y = r.cy - r.height / 2 + b * r.height;
    pos.push((x / W) * 2 - 1, 1 - (y / H) * 2);
    const fa = p.flipH ? 1 - a : a;
    const fb = p.flipV ? 1 - b : b;
    const [u, v] = turn === 0 ? [fa, fb] : turn === 90 ? [fb, 1 - fa] : turn === 180 ? [1 - fa, 1 - fb] : [1 - fb, fa];
    tex.push(u, v);
  }
  // On-screen extent along the picture's own x and y axes.
  const extent: [number, number] = turn % 180 ? [r.height, r.width] : [r.width, r.height];
  return { pos, tex, extent };
}

/** Outcome rule 2: the intermediate covers the placed size, capped by the source and the target. */
export function intermediateSize(
  size: SourceSize,
  extent: readonly [number, number],
  W: number,
  H: number,
): LayerDraw['intermediate'] {
  const cap = Math.max(W, H);
  const width = Math.max(1, Math.min(size.width, Math.ceil(extent[0]), cap));
  const height = Math.max(1, Math.min(size.height, Math.ceil(extent[1]), cap));
  // RULE-02 / D-012: sources sampled down by 2× or more (5K → 2160 and smaller targets) use 4 taps.
  const taps = size.width / width >= 2 || size.height / height >= 2 ? 4 : 1;
  return { width, height, taps };
}

const FILL_COVER: Placement = {
  mode: 'fill',
  scale: 100,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
};

/**
 * Implements: ADR-0006 §1 — the draw list of `plan` on a W × H target. `sizes[i]` is the picture of
 * `plan.layers[i]` (null when its frame is not available: the layer shows its background only).
 * `textSizes` gives each text bitmap's pixel size and the `s` it was rasterised for.
 */
export function drawList(
  plan: FramePlan,
  W: number,
  H: number,
  sizes: readonly (SourceSize | null)[],
  textSizes: ReadonlyMap<string, { readonly width: number; readonly height: number; readonly s: number }>,
  options: DrawOptions = {},
): DrawList {
  const s = Math.min(W, H);
  const blur = plan.frame.background === 'blur';
  const background = backgroundColour(plan.frame);
  const layers: LayerDraw[] = [];
  plan.layers.forEach((layer, i) => {
    const size = sizes[i];
    const clip = layer.clip;
    if (!size) {
      layers.push({
        clipId: clip.id,
        grade: NEUTRAL,
        quad: { pos: [], tex: [] },
        intermediate: { width: 1, height: 1, taps: 1 },
        sharpenStep: [0, 0],
        blur: null,
        weight: layer.weight,
        opacity: layer.opacity,
        frame: plan.frameIndex,
        clip: clipHash(clip.id),
        blank: true,
      });
      return;
    }
    const placed = placeQuad(W, H, size, clip.placement);
    const grade = options.compare === clip.id ? NEUTRAL : gradeUniforms(clip.adjustments, clip.look);
    const r = SHARPEN_RADIUS * s;
    layers.push({
      clipId: clip.id,
      grade,
      quad: { pos: placed.pos, tex: placed.tex },
      intermediate: intermediateSize(size, placed.extent, W, H),
      sharpenStep: [r / Math.max(1, placed.extent[0]), r / Math.max(1, placed.extent[1])],
      blur: blur
        ? placeQuad(W, H, size, {
            ...FILL_COVER,
            rotation: clip.placement.rotation,
            flipH: clip.placement.flipH,
            flipV: clip.placement.flipV,
          })
        : null,
      weight: layer.weight,
      opacity: layer.opacity,
      frame: plan.frameIndex,
      clip: clipHash(clip.id),
      blank: false,
    });
  });
  const texts: TextDraw[] = [];
  for (const item of plan.texts) {
    const t = textSizes.get(item.layer.id);
    if (!t || item.opacity <= 0) continue;
    const k = s / t.s;
    const w = t.width * k;
    const h = t.height * k;
    // Whole output pixels at the scale the bitmap was made for, so text stays crisp (ADR-0012).
    const x0 = k === 1 ? Math.round(item.layer.x * W - w / 2) : item.layer.x * W - w / 2;
    const y0 = k === 1 ? Math.round(item.layer.y * H - h / 2) : item.layer.y * H - h / 2;
    const X = (x: number): number => (x / W) * 2 - 1;
    const Y = (y: number): number => 1 - (y / H) * 2;
    texts.push({
      id: item.layer.id,
      quad: {
        pos: [X(x0), Y(y0), X(x0 + w), Y(y0), X(x0), Y(y0 + h), X(x0 + w), Y(y0 + h)],
        tex: [0, 0, 1, 0, 0, 1, 1, 1],
      },
      opacity: item.opacity,
    });
  }
  return { width: W, height: H, s, background, fadeTo: background, grainCell: grainCell(s), layers, texts };
}

/**
 * The colour of one output pixel from the layers' colours (CPU mirror of the mix pass): each layer is
 * mixed toward the fade target by its opacity, then the layers are blended by their weights (RULE-10).
 * With no layer, the background shows.
 */
export function mixPixel(
  list: Pick<DrawList, 'fadeTo' | 'background'>,
  layers: readonly { colour: Rgb; weight: number; opacity: number }[],
): Rgb {
  if (layers.length === 0) return list.background;
  const out: [number, number, number] = [0, 0, 0];
  for (const l of layers)
    for (let c = 0; c < 3; c++) out[c]! += l.weight * (list.fadeTo[c]! + l.opacity * (l.colour[c]! - list.fadeTo[c]!));
  return out;
}
