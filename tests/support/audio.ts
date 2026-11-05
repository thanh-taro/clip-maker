// Test helpers for MOD-Audio DSP tests: analytic signals and measurements (adapters/tests.md: DSP
// against analytic signals).
export const SR = 48_000;

/** A sine of `freq` Hz, `seconds` long, amplitude `amp`, starting phase `phase` (radians). */
export function sine(freq: number, seconds: number, amp = 0.5, phase = 0): Float32Array {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR + phase);
  return x;
}

export const constant = (value: number, seconds: number): Float32Array =>
  new Float32Array(Math.round(seconds * SR)).fill(value);

export function rms(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

export const db = (ratio: number): number => 20 * Math.log10(ratio);

/** |DFT| of a Hann-windowed segment at frequency f. */
function magnitude(x: Float32Array, f: number): number {
  const n = x.length;
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * f) / SR;
  for (let i = 0; i < n; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    re += h * x[i]! * Math.cos(w * i);
    im -= h * x[i]! * Math.sin(w * i);
  }
  return Math.hypot(re, im);
}

/** The dominant frequency in [lo, hi] Hz: coarse scan, then golden-section refinement (≈ 0.001 Hz). */
export function peakFrequency(x: Float32Array, lo: number, hi: number): number {
  let best = lo;
  let bestM = -1;
  for (let f = lo; f <= hi; f += 0.5) {
    const m = magnitude(x, f);
    if (m > bestM) {
      bestM = m;
      best = f;
    }
  }
  let a = best - 0.5;
  let b = best + 0.5;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 30; k++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (magnitude(x, c) > magnitude(x, d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}

/** FNV-1a over the bytes of float arrays. */
export function hash(...arrays: Float32Array[]): string {
  let h = 0x811c9dc5;
  for (const a of arrays) {
    const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i]!, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A deterministic pseudo-random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Speech/music-like test material: a few partials with a slow amplitude wobble plus some noise. */
export function material(seconds: number, seed = 1): Float32Array {
  const n = Math.round(seconds * SR);
  const r = rng(seed);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = 0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t);
    x[i] =
      env * (0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 330 * t + 1)) + 0.05 * (r() * 2 - 1);
  }
  return x;
}
