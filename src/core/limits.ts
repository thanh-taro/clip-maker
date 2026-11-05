// MOD-Core — the numbers of the rules, as typed constants (specs/10-domain/rules.md).
// Times in seconds unless the name says otherwise; tenths are 0.1 s steps.

/** Implements: RULE-02 input limits. */
export const RULE_02 = Object.freeze({
  maxBytes: 4_000_000_000,
  maxMediaSeconds: 3 * 60 * 60,
  maxVideoSide: 5120,
  maxVideoPixels: 14_745_600,
  maxPhotoSide: 32_768,
  maxPhotoPixels: 268_435_456,
  maxSources: 100,
  /** Video larger than this is used scaled down to fit inside it (D-012). */
  videoFit: Object.freeze({ width: 3840, height: 2160 }),
  /** A photo above either threshold is scaled down on load to `photoScaledLongSide`. */
  photoScaleSide: 16_384,
  photoScalePixels: 16_777_216,
  photoScaledLongSide: 4096,
});

/** Implements: RULE-03 project length. */
export const RULE_03 = Object.freeze({ maxProjectSeconds: 600 });

/** Implements: RULE-04 frame settings. */
export const RULE_04 = Object.freeze({
  aspects: Object.freeze(['9:16', '1:1', '4:5', '16:9', 'original'] as const),
  frameRates: Object.freeze([24, 25, 30, 60] as const),
  defaultFrameRate: 30 as const,
  /** Until the user chooses a rate, the first video added at this rate or more sets 60. */
  detectHighRateFrom: 50,
  /** Original aspect with an empty main track. */
  emptyOriginalAspect: '16:9' as const,
});

/** Implements: RULE-05 clip timing. */
export const RULE_05 = Object.freeze({
  minLengthTenths: 1,
  photoDefaultSeconds: 3,
  photoMinTenths: 1,
  photoMaxSeconds: 60,
});

/** Implements: RULE-06 speed, as speed × 100. */
export const RULE_06 = Object.freeze({
  minPct: 25,
  maxPct: 400,
  stepPct: 5,
  defaultPct: 100,
  quickPct: Object.freeze([25, 50, 100, 150, 200, 400] as const),
});

/** Implements: RULE-07 placement. */
export const RULE_07 = Object.freeze({
  minScale: 50,
  maxScale: 400,
  defaultScale: 100,
  nudge: 0.01,
  nudgeShift: 0.1,
  snapPx: 8,
});

/** Implements: RULE-08 adjustments. */
export const RULE_08 = Object.freeze({
  bipolar: Object.freeze([
    'brightness',
    'contrast',
    'highlights',
    'shadows',
    'saturation',
    'vibrance',
    'temperature',
    'tint',
  ] as const),
  unipolar: Object.freeze(['sharpen', 'vignette', 'grain', 'fade'] as const),
  bipolarMin: -100,
  bipolarMax: 100,
  unipolarMin: 0,
  unipolarMax: 100,
});

/** Implements: RULE-09 looks. */
export const RULE_09 = Object.freeze({ minIntensity: 0, maxIntensity: 100, defaultIntensity: 100 });

/** Implements: RULE-10 fades. */
export const RULE_10 = Object.freeze({
  clipFadeMaxSeconds: 3,
  quickFadeTenths: 5,
  crossFadeMinTenths: 1,
  crossFadeMaxSeconds: 2,
  crossFadeDefaultTenths: 5,
  textFadeTenths: 3,
  audioFadeMaxSeconds: 5,
});

/** Implements: RULE-11 text. */
export const RULE_11 = Object.freeze({
  maxLayers: 50,
  maxCharacters: 500,
  wrapWidth: 0.9,
  minSize: 2,
  maxSize: 20,
  defaultSize: 6,
  outlineOfSize: 0.08,
  boxOpacity: 0.7,
  defaultX: 0.5,
  defaultY: 0.8,
  safeMargin: 0.05,
  snapPx: 8,
  defaultSeconds: 3,
});

/** Implements: RULE-12 sound. */
export const RULE_12 = Object.freeze({ minVolume: 0, maxVolume: 200, defaultVolume: 100, limiterDbtp: -1 });

/** Implements: RULE-15 video export choices (the bitrate tables live with F-015). */
export const RULE_15 = Object.freeze({
  resolutions: Object.freeze([480, 720, 1080, 1440, 2160] as const),
  defaultResolution: 1080,
  qualities: Object.freeze(['smaller', 'balanced', 'best'] as const),
  defaultQuality: 'balanced' as const,
  quickTargetsMB: Object.freeze([8, 10, 25, 50] as const),
  minTargetMB: 1,
  maxTargetMB: 4000,
});

/** Implements: RULE-16 other exports. */
export const RULE_16 = Object.freeze({
  gifMaxSeconds: 15,
  gifSizes: Object.freeze([320, 480, 640] as const),
  gifDefaultSize: 480,
  gifRates: Object.freeze([10, 15] as const),
  gifDefaultRate: 15,
  wav: Object.freeze({ bitsPerSample: 16, sampleRate: 48_000, channels: 2 }),
});
