// Test support: very large files that take no memory. A `virtualFile` is a real MP4 followed by one
// ISO-BMFF `free` box (64-bit size) of zeros up to the requested size. Slices are views; bytes are
// made only when a reader pulls them (`arrayBuffer()` of a slice, or chunks of `stream()`), and every
// delivered range is recorded (NFR-05, F-001.R7, RULE-02).

type Log = [number, number][];
const READS = new WeakMap<Blob, Log>();
const CHUNK = 64 * 1024;
/** A single `arrayBuffer()` larger than this would be a whole-file read in disguise. */
const MAX_BUFFER = 64 * 1024 * 1024;

/** The [start, end) byte ranges delivered to readers of a virtual file, in order. */
export const readsOf = (blob: Blob): readonly [number, number][] => READS.get(blob) ?? [];

function freeBoxHeader(size: number): Uint8Array {
  const h = new Uint8Array(16);
  const v = new DataView(h.buffer);
  v.setUint32(0, 1); // size 1 = a 64-bit size follows the type
  h.set([0x66, 0x72, 0x65, 0x65], 4); // 'free'
  v.setBigUint64(8, BigInt(size));
  return h;
}

class VirtualBlob extends Blob {
  readonly #head: Uint8Array;
  readonly #start: number;
  readonly #end: number;
  readonly #log: Log;

  constructor(head: Uint8Array, start: number, end: number, log: Log) {
    super([]);
    this.#head = head;
    this.#start = start;
    this.#end = end;
    this.#log = log;
  }

  override get size(): number {
    return this.#end - this.#start;
  }

  #bytes(s: number, e: number): Uint8Array {
    this.#log.push([s, e]);
    const out = new Uint8Array(e - s);
    if (s < this.#head.length) out.set(this.#head.subarray(s, Math.min(e, this.#head.length)));
    return out;
  }

  override slice(start = 0, end = this.size): Blob {
    const abs = (x: number) => this.#start + Math.max(0, Math.min(this.size, x < 0 ? this.size + x : x));
    const s = abs(start);
    return new VirtualBlob(this.#head, s, Math.max(s, abs(end)), this.#log);
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.size > MAX_BUFFER) throw new Error(`VirtualBlob: ${this.size}-byte arrayBuffer()`);
    return this.#bytes(this.#start, this.#end).buffer as ArrayBuffer;
  }

  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    let pos = this.#start;
    return new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull: (c) => {
          if (pos >= this.#end) return c.close();
          const e = Math.min(this.#end, pos + CHUNK);
          c.enqueue(this.#bytes(pos, e) as Uint8Array<ArrayBuffer>);
          pos = e;
        },
      },
      { highWaterMark: 0 },
    );
  }
}

/** A Blob of `size` bytes: `real` (an MP4 file) then a `free` box of zeros. */
export function virtualFile(real: Uint8Array, size: number): Blob {
  const head = new Uint8Array(real.length + 16);
  head.set(real);
  head.set(freeBoxHeader(size - real.length), real.length);
  const log: Log = [];
  const blob = new VirtualBlob(head, 0, size, log);
  READS.set(blob, log);
  return blob;
}

/** A virtual file with a name, as `intake` receives files. */
export function virtualNamedFile(real: Uint8Array, size: number, name: string): File {
  const blob = virtualFile(real, size);
  Object.defineProperty(blob, 'name', { value: name });
  Object.defineProperty(blob, 'lastModified', { value: 0 });
  return blob as File;
}
