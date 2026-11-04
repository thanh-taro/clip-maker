// MOD-Container — read and write media files in pieces; the only module that imports the container
// library (DEP-04 mediabunny, ADR-0005; lint-enforced). Runs in workers only.
// (specs/40-technical/modules/MOD-Container.md). Phase 3.3 scaffold: the public surface; reading is
// built with F-001, writing with F-015 / F-016 (the writer is loaded only in the export worker, D-042).
import type { Input } from 'mediabunny';
import { notImplemented } from '../core';

/** A streaming target the writer fills: implemented by MOD-Scratch (file) and MOD-Export (memory). */
export interface Sink {
  write(chunk: Uint8Array, position: number): void | Promise<void>;
  close(): void | Promise<void>;
}

/** What `openInput` reports about a file (fields defined with F-001). */
export interface OpenedInput {
  readonly input: Input;
}

export type OutputFormat = 'mp4' | 'webm' | 'm4a' | 'ogg';

export const openInput = (_file: Blob): Promise<OpenedInput> => notImplemented('MOD-Container openInput');
export const createOutput = (_format: OutputFormat, _sink: Sink, _tracks: unknown): never =>
  notImplemented('MOD-Container createOutput');
