// MOD-Media — the source registry: source id → the `File` (a reference only, never copied, INV-01),
// what the probe learnt, and what was decoded from it (a photo's bitmap, a video's small first frame).
// ADR-0009 §7: decoded pictures live only while the source is in the project; a source that only the
// history can bring back keeps its `File` and probe results, and its pictures are rebuilt lazily when
// it returns (`load`); a source in neither the project nor any history step is forgotten (`sync`).
// Reference counts remain for callers that hold a source outside the project (retain/release).
import type { Source } from '../core';
import type { AcceptedSource } from './intake';
import type { ProbeDetails } from './types';

/** What is decoded from a source's file for display. */
export interface Decoded {
  readonly bitmap?: ImageBitmap;
  /** A video's small first frame (CMP-MediaPanel). */
  readonly thumbnail?: ImageBitmap;
}

export interface RegistryEntry extends Decoded {
  readonly source: Source;
  readonly file: File;
  readonly details: ProbeDetails;
}

/** Decodes a source's pictures again (the analysis worker's probe, in the app). */
export type Redecode = (entry: RegistryEntry) => Promise<Decoded>;

interface Slot {
  entry: RegistryEntry;
  refs: number;
  /** Decoded pictures were freed and must be rebuilt before use. */
  unloaded: boolean;
  loading: Promise<RegistryEntry> | null;
}

function closeDecoded(d: Decoded): void {
  d.bitmap?.close();
  d.thumbnail?.close();
}

const bare = ({ source, file, details }: RegistryEntry): RegistryEntry => ({ source, file, details });

export class SourceRegistry {
  readonly #slots = new Map<string, Slot>();
  #redecode: Redecode | null = null;

  /** How pictures are rebuilt after `unload` (set by the app with the analysis worker). */
  setRedecode(fn: Redecode | null): void {
    this.#redecode = fn;
  }

  /** Registers an accepted source with one reference (the batch that added it). */
  add(a: AcceptedSource): RegistryEntry {
    const entry: RegistryEntry = {
      source: a.source,
      file: a.file,
      details: a.details,
      ...(a.bitmap ? { bitmap: a.bitmap } : {}),
      ...(a.thumbnail ? { thumbnail: a.thumbnail } : {}),
    };
    this.#slots.set(a.source.id, { entry, refs: 1, unloaded: false, loading: null });
    return entry;
  }

  get(id: string): RegistryEntry | undefined {
    return this.#slots.get(id)?.entry;
  }

  has(id: string): boolean {
    return this.#slots.has(id);
  }

  /** True when the source's pictures were freed and not rebuilt yet. */
  isUnloaded(id: string): boolean {
    return this.#slots.get(id)?.unloaded ?? false;
  }

  ids(): string[] {
    return [...this.#slots.keys()];
  }

  retain(id: string): void {
    const s = this.#slots.get(id);
    if (s) s.refs++;
  }

  /** Drops one reference; the last one frees the pictures and forgets the file. */
  release(id: string): void {
    const s = this.#slots.get(id);
    if (!s) return;
    if (--s.refs > 0) return;
    this.forget(id);
  }

  /** Forgets a source entirely: its pictures are freed and the `File` reference dropped. */
  forget(id: string): void {
    const s = this.#slots.get(id);
    if (!s) return;
    closeDecoded(s.entry);
    this.#slots.delete(id);
  }

  /** ADR-0009 §7: frees a source's decoded pictures; the `File` and probe results stay. */
  unload(id: string): void {
    const s = this.#slots.get(id);
    if (!s || s.unloaded) return;
    closeDecoded(s.entry);
    s.entry = bare(s.entry);
    s.unloaded = true;
  }

  /** The entry with its pictures, rebuilding them first if they were freed (lazily, once). */
  load(id: string): Promise<RegistryEntry | undefined> {
    const s = this.#slots.get(id);
    if (!s) return Promise.resolve(undefined);
    if (!s.unloaded) return Promise.resolve(s.entry);
    if (s.loading) return s.loading;
    const redecode = this.#redecode;
    if (!redecode) return Promise.resolve(s.entry);
    s.loading = redecode(s.entry)
      .catch((): Decoded => ({}))
      .then((d) => {
        s.loading = null;
        // Forgotten or unloaded again meanwhile: the pictures are not wanted.
        if (this.#slots.get(id) !== s || !s.unloaded) {
          closeDecoded(d);
          return s.entry;
        }
        s.entry = {
          ...bare(s.entry),
          ...(d.bitmap ? { bitmap: d.bitmap } : {}),
          ...(d.thumbnail ? { thumbnail: d.thumbnail } : {}),
        };
        s.unloaded = false;
        return s.entry;
      });
    return s.loading;
  }

  /**
   * Implements: ADR-0009 §7, INV-01 — after every edit, undo or redo: sources in the project keep their
   * pictures; sources only the history can restore keep their `File` and lose their pictures; any other
   * source is forgotten (unless something else retains it).
   */
  sync(inProject: ReadonlySet<string>, inHistory: ReadonlySet<string>): void {
    for (const [id, s] of this.#slots) {
      if (inProject.has(id)) continue;
      if (inHistory.has(id) || s.refs > 1) this.unload(id);
      else this.forget(id);
    }
  }

  /** New project (RULE-23): everything goes. */
  clear(): void {
    for (const s of this.#slots.values()) closeDecoded(s.entry);
    this.#slots.clear();
  }

  get size(): number {
    return this.#slots.size;
  }
}
