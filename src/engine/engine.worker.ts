// MOD-Engine — the engine worker (ADR-0003 §2): MOD-Container reads, MOD-Codec decoders, the engine's
// scheduling and frame caches, and MOD-Compositor drawing into the preview canvas the main thread hands
// over once. Decoded frames never cross a thread. Answers the start-up handshake and the
// MOD-Core `ToEngine` messages with `FromEngine` events. It also serves the sources' encoded sound to the
// audio worker (the sound feed, ADR-0008 §6), since this worker holds the files and the reader.
import { helloFrom, type EngineMedia, type FromEngine, type ToEngine, type WorkerScope } from '../core';
import { createCompositor, effectsCheck } from '../compositor';
import { serveSound } from '../container';
import { BUDGETS, deviceClass, platformHints } from './budget';
import { Engine, type EngineDeps, type EngineFrame } from './engine';
import { openVideoSource } from './video';

/** Coarse copies are preview-size (ADR-0009 outcome rule 4): longer side 640 px. */
const COARSE_SIDE = 640;

const scope = self as unknown as WorkerScope<ToEngine, FromEngine>;
const cls = deviceClass(platformHints());

const engine = new Engine({
  post: (m, transfer) => scope.postMessage(m, transfer ?? []),
  createCompositor,
  // VideoFrame is an EngineFrame; the slot's callbacks only ever receive the frames it decoded.
  openVideo: openVideoSource as unknown as EngineDeps['openVideo'],
  effectsCheck,
  coarseCopy: async (f: EngineFrame) => {
    const frame = (f as unknown as VideoFrame).clone();
    try {
      const k = Math.min(1, COARSE_SIDE / Math.max(frame.displayWidth, frame.displayHeight));
      return await createImageBitmap(frame, {
        resizeWidth: Math.max(1, Math.round(frame.displayWidth * k)),
        resizeHeight: Math.max(1, Math.round(frame.displayHeight * k)),
        resizeQuality: 'medium',
      });
    } finally {
      frame.close();
    }
  },
  budget: BUDGETS[cls],
  phone: cls === 'phone',
  now: () => performance.now(),
  // F-008.R1: the look thumbnails' own small canvas (a second context, so the preview's picture never changes).
  thumbnails: {
    canvas: (width, height) => new OffscreenCanvas(width, height),
    bitmap: (canvas) => canvas.transferToImageBitmap(),
  },
});

/** The sources' files for the sound feed (video and audio sources), by id. */
const files = new Map<string, Blob>();
let sound: ReturnType<typeof serveSound> | null = null;
const fileOf = (m: EngineMedia): Blob | null => (m.kind === 'photo' ? null : m.file);

function trackFiles(add: readonly EngineMedia[], remove: readonly string[]): void {
  for (const id of remove) {
    files.delete(id);
    sound?.forget(id);
  }
  for (const m of add) {
    const f = fileOf(m);
    if (f && !files.has(m.id)) {
      files.set(m.id, f);
      sound?.added(m.id);
    }
  }
}

scope.onmessage = (e: MessageEvent<ToEngine>) => {
  const m = e.data;
  if (m?.type === 'hello') {
    scope.postMessage(helloFrom('engine') as FromEngine);
    return;
  }
  if (m.type === 'engine:soundFeed') {
    sound?.close();
    // The project reaches the audio worker before this worker gets a new source's file: wait for it.
    sound = serveSound(m.port, (id) => files.get(id), { wait: true });
    return;
  }
  if (m.type === 'engine:media') {
    const next = new Set(m.media.map((x) => x.id));
    trackFiles(
      m.media,
      [...files.keys()].filter((id) => !next.has(id)),
    );
  } else if (m.type === 'engine:mediaChanges') trackFiles(m.add, m.remove);
  engine.handle(m);
};
