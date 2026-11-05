// MOD-Compositor — the one WebGL2 `paint` for preview, thumbnails and exports
// (specs/40-technical/modules/MOD-Compositor.md, ADR-0006, ADR-0007 and their outcomes). Never reads
// language, theme or view state (INV-05). Pure parts (grade maths, look tables, plan → draw list) are
// separate from the WebGL code so they are tested without a GPU; `reference` is the CPU oracle.
export {
  createCompositor,
  ContextLostError,
  RECOVER_INTERVAL_MS,
  RECOVER_TRIES,
  type Compositor,
  type CompositorOptions,
  type PaintFrame,
} from './compositor';
export {
  effectsCheck,
  effectsProject,
  classifyEffects,
  SLOW_FPS,
  EFFECTS_FRAMES,
  EFFECTS_WARMUP,
  type EffectsResult,
} from './effects';
export {
  backgroundColour,
  drawList,
  hexToRgb,
  intermediateSize,
  mixPixel,
  placeQuad,
  type DrawList,
  type DrawOptions,
  type LayerDraw,
  type Quad,
  type Rotation,
  type SourceSize,
  type TextDraw,
} from './draw';
export {
  clipHash,
  gradeUniforms,
  grainCell,
  grainHash,
  NEUTRAL,
  pcg,
  reference,
  toLinear,
  toSrgb,
  type GradeUniforms,
  type Rgb,
} from './grade';
export {
  decodeLookStrip,
  identityTable,
  lutSample,
  LUT_BYTES,
  LUT_N,
  stripFromTable,
  tableFromStrip,
  type LookTable,
} from './lut';
