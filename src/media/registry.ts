// MOD-Media — the source registry: source id → the `File` (a reference only, never copied, INV-01),
// what the probe learnt, and a photo's bitmap. Entries are counted: the project and the history each
// retain a source while they can show or restore it; the last release drops its caches (MOD-Media
// spec: "keeps the File reference while history can restore it").
import type { Source } from '../core';
import type { AcceptedSource } from './intake';
import type { ProbeDetails } from './types';

export interface RegistryEntry {
  readonly source: Source;
  readonly file: File;
  readonly details: ProbeDetails;
  readonly bitmap?: ImageBitmap;
}

export class SourceRegistry {
  readonly #entries = new Map<string, { entry: RegistryEntry; refs: number }>();

  /** Registers an accepted source with one reference (the batch that added it). */
  add(a: AcceptedSource): RegistryEntry {
    const entry: RegistryEntry = {
      source: a.source,
      file: a.file,
      details: a.details,
      ...(a.bitmap ? { bitmap: a.bitmap } : {}),
    };
    this.#entries.set(a.source.id, { entry, refs: 1 });
    return entry;
  }

  get(id: string): RegistryEntry | undefined {
    return this.#entries.get(id)?.entry;
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }

  retain(id: string): void {
    const e = this.#entries.get(id);
    if (e) e.refs++;
  }

  /** Drops one reference; the last one frees the bitmap and forgets the file. */
  release(id: string): void {
    const e = this.#entries.get(id);
    if (!e) return;
    if (--e.refs > 0) return;
    e.entry.bitmap?.close();
    this.#entries.delete(id);
  }

  /** New project (RULE-23): everything goes. */
  clear(): void {
    for (const { entry } of this.#entries.values()) entry.bitmap?.close();
    this.#entries.clear();
  }

  get size(): number {
    return this.#entries.size;
  }
}
