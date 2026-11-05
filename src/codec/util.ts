// MOD-Codec — small pure helpers: the probe concurrency cap and the AAC description fix.

/**
 * Runs `fn` over `items` with at most `limit` calls in flight, keeping the order of results.
 * Implements: ADR-0004 outcome item 3 — at most 4 `isConfigSupported` calls at once (unbounded
 * parallel encoder probes crashed the renderer in Chromium and Chrome).
 */
export async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

/** The concurrency cap of every capability probe (ADR-0004 outcome item 3). */
export const PROBE_CONCURRENCY = 4;

const bytesOf = (d: AllowSharedBufferSource): Uint8Array =>
  d instanceof Uint8Array
    ? d
    : ArrayBuffer.isView(d)
      ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
      : new Uint8Array(d);

/**
 * Implements: ADR-0004 outcome item 4 — an AAC description that starts with tag 0x03 (WebKit's
 * 39-byte ES_Descriptor) is reduced to its AudioSpecificConfig (the tag 0x05 payload). Any other
 * description is returned unchanged; a malformed descriptor gives null.
 */
export function normaliseAacDescription(description: AllowSharedBufferSource): Uint8Array | null {
  const b = bytesOf(description);
  if (b[0] !== 0x03) return b;
  let i = 0;
  const len = (): number => {
    let n = 0;
    let x = 0;
    do {
      x = b[i++] ?? 0;
      n = (n << 7) | (x & 0x7f);
    } while (x & 0x80 && i < b.length);
    return n;
  };
  while (i < b.length) {
    const tag = b[i++];
    const n = len();
    if (tag === 0x05) return i + n <= b.length ? b.slice(i, i + n) : null;
    if (tag === 0x03) {
      // ES_ID (2) + flags (1); dependent stream, URL and OCR fields per the flags.
      const flags = b[i + 2] ?? 0;
      i += 3;
      if (flags & 0x80) i += 2;
      if (flags & 0x40) i += 1 + (b[i] ?? 0);
      if (flags & 0x20) i += 2;
      continue;
    }
    if (tag === 0x04) {
      i += 13; // objectTypeIndication … avgBitrate, then the nested 0x05
      continue;
    }
    i += n;
  }
  return null;
}

/** An audio decoder config with its AAC description normalised (ADR-0004 outcome item 4). */
export function withNormalisedDescription<C extends AudioDecoderConfig>(config: C): C {
  if (!config.codec.startsWith('mp4a') || !config.description) return config;
  if (bytesOf(config.description)[0] !== 0x03) return config;
  const asc = normaliseAacDescription(config.description);
  return asc ? { ...config, description: asc } : config;
}
