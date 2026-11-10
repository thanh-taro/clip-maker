// MOD-Audio — a decoded source's channels mapped to stereo by fixed rules (ADR-0008 §2; the rules are
// build question 83's assumption). Pure, no DOM.
// - 1 channel: the same signal on both sides, at full level.
// - 2 channels: left and right as they are.
// - More: channels in the WAVE / SMPTE order the decoders deliver (L, R, C, LFE, then the surround
//   pairs); the centre goes to both sides and each surround to its side at −3 dB (×√½, ITU-R BS.775);
//   the LFE channel is left out. Nothing is normalised: the mix's limiter keeps the peak (RULE-12).
// Implements: ADR-0008 §2 (stereo by fixed rules).

const H = Math.SQRT1_2;

/** Per channel count above 2: [left gain, right gain] of each channel in order. */
const LAYOUTS: Record<number, readonly (readonly [number, number])[]> = {
  3: [
    [1, 0],
    [0, 1],
    [H, H],
  ], // L R C
  4: [
    [1, 0],
    [0, 1],
    [H, 0],
    [0, H],
  ], // L R Ls Rs
  5: [
    [1, 0],
    [0, 1],
    [H, H],
    [H, 0],
    [0, H],
  ], // L R C Ls Rs
  6: [
    [1, 0],
    [0, 1],
    [H, H],
    [0, 0],
    [H, 0],
    [0, H],
  ], // L R C LFE Ls Rs
  7: [
    [1, 0],
    [0, 1],
    [H, H],
    [0, 0],
    [H, H],
    [H, 0],
    [0, H],
  ], // L R C LFE Cs Ls Rs
  8: [
    [1, 0],
    [0, 1],
    [H, H],
    [0, 0],
    [H, 0],
    [0, H],
    [H, 0],
    [0, H],
  ], // L R C LFE Lb Rb Ls Rs
};

/** The stereo pair of a decoded block (planes of equal length). Mono and stereo planes are reused. */
export function toStereo(planes: readonly Float32Array[]): [Float32Array, Float32Array] {
  const n = planes.length;
  const a = planes[0] ?? new Float32Array(0);
  if (n === 1) return [a, a];
  if (n === 2) return [a, planes[1]!];
  const layout = LAYOUTS[Math.min(n, 8)]!;
  const len = a.length;
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let l = 0;
    let r = 0;
    for (let c = 0; c < layout.length; c++) {
      const [gl, gr] = layout[c]!;
      const x = planes[c]![i]!;
      l += gl * x;
      r += gr * x;
    }
    L[i] = l;
    R[i] = r;
  }
  return [L, R];
}
