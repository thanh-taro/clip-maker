// MOD-Export — sink choice and the memory sink (ADR-0010 §2 and outcome item 5).
// Implements: F-015 edge case "not enough free storage" and F-019.R7 (COPY-error.no_space before
// starting), NFR-05 (scratch file first; memory only under the device cap).
import { BatchingSink } from '../scratch';

/** Memory sink caps (ADR-0010 §2.2): phone 300 MB, laptop 1.5 GB. */
export const MEMORY_CAP = { phone: 300_000_000, laptop: 1_500_000_000 } as const;
/** Room is checked for the estimate × 1.3 (ADR-0010 §2). */
export const ROOM_FACTOR = 1.3;

export type SinkKind = 'scratch' | 'memory' | 'no_space';

/**
 * Implements: ADR-0010 §2 / outcome item 5 — the scratch file when the origin-private file system is
 * there and has room for the estimate × 1.3; else memory when the estimate × 1.3 is under the device
 * cap; else refuse (COPY-error.no_space).
 */
export function chooseSink(o: {
  readonly opfs: boolean;
  /** `quota − usage ≥ estimate × 1.3` (MOD-Scratch hasRoom). */
  readonly room: boolean;
  readonly estimate: number;
  readonly cap: number;
}): SinkKind {
  if (o.opfs && o.room) return 'scratch';
  if (o.estimate * ROOM_FACTOR < o.cap) return 'memory';
  return 'no_space';
}

/** A positioned in-memory file (`Blob` assembled from ≥ 1 MB parts); back-patches land in place. */
export class MemorySink {
  private parts: Uint8Array[] = [];
  private size = 0;
  private readonly batch = new BatchingSink((chunk, at) => this.put(chunk, at));

  write(chunk: Uint8Array, position: number): void {
    this.batch.write(chunk, position);
  }

  close(): void {
    this.batch.flush();
  }

  reset(): void {
    this.batch.flush();
    this.parts = [];
    this.size = 0;
  }

  get bytes(): number {
    return this.size;
  }

  blob(type: string): Blob {
    this.batch.flush();
    return new Blob(this.parts as BlobPart[], { type });
  }

  private put(chunk: Uint8Array, at: number): void {
    if (at > this.size) {
      this.parts.push(new Uint8Array(at - this.size));
      this.size = at;
    }
    let pos = 0;
    let i = 0;
    let done = 0;
    // Overwrite the part of `chunk` that falls inside what is already written.
    while (done < chunk.length && at + done < this.size && i < this.parts.length) {
      const part = this.parts[i]!;
      const end = pos + part.length;
      const from = at + done;
      if (from < end) {
        const n = Math.min(end - from, chunk.length - done);
        part.set(chunk.subarray(done, done + n), from - pos);
        done += n;
      }
      pos = end;
      i++;
    }
    if (done < chunk.length) {
      this.parts.push(chunk.slice(done));
      this.size += chunk.length - done;
    }
  }
}
