// Types for the parts of gifenc (DEP-05, MIT, ADR-0010 §10) MOD-Export uses; the package ships none.
declare module 'gifenc' {
  export type Palette = number[][];
  export interface GifEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: { palette?: Palette; delay?: number; repeat?: number; first?: boolean },
    ): void;
    writeHeader(): void;
    finish(): void;
    bytesView(): Uint8Array;
    reset(): void;
  }
  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoder;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: string },
  ): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array;
}
