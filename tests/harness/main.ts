// Media harness (test-only, served by the Vite dev server for tests/e2e/media-*.spec.ts; ADR-0016 §4
// "MOD-Container in a test page"). Exposes MOD-Media intake through the real analysis worker, and
// MOD-Codec's probe, grid and trial encodes, as `window.harness`. Results are plain data.
// The 5120 × 2880 fixture is made here with the browser's own VP9 encoder and the container library's
// writer (test code only; the app loads the writer in the export worker alone, D-042).
import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Output, WebMOutputFormat } from 'mediabunny';
import {
  deviceCheck,
  probeCapabilities,
  probeExportGrid,
  trialAudioEncode,
  trialVideoEncode,
  videoEncoderConfig,
  type AudioCodecId,
  type VideoCodecId,
} from '../../src/codec';
import { registerOffline } from '../../src/host';
import { intake, startAnalysisWorker, type IntakeItem } from '../../src/media';
import { exportHarness } from './export';
import { videoHarness } from './video';

const worker = startAnalysisWorker();
const extra: File[] = [];

export interface IntakeSummary {
  accepted: {
    name: string;
    kind: string;
    width?: number;
    height?: number;
    duration?: number;
    frameRate?: number;
    hasSound?: boolean;
    scaled: boolean;
    nativeWidth?: number;
    nativeHeight?: number;
    rotation: number;
    firstTimestamp?: number;
    bitmap: boolean;
  }[];
  refused: { name: string; reason: string }[];
  notices: { id: string; name: string }[];
  cancelled: boolean;
  progress: string[];
}

function pickedFiles(): File[] {
  const input = document.getElementById('files') as HTMLInputElement;
  return [...(input.files ?? []), ...extra];
}

async function runIntake(items: IntakeItem[], cancelAt?: number): Promise<IntakeSummary> {
  const ctl = new AbortController();
  const progress: string[] = [];
  const r = await intake(
    items,
    (p) => {
      progress.push(`${p.position}/${p.total} ${p.name}`);
      if (cancelAt !== undefined && p.position === cancelAt && p.name) setTimeout(() => ctl.abort(), 0);
    },
    ctl.signal,
    { worker, sourceCount: 0, rate: 30 },
  );
  return {
    accepted: r.accepted.map((a) => ({
      name: a.source.name,
      kind: a.source.kind,
      ...(a.source.width !== undefined ? { width: a.source.width, height: a.source.height } : {}),
      ...(a.source.duration !== undefined ? { duration: a.source.duration } : {}),
      ...(a.source.frameRate !== undefined ? { frameRate: a.source.frameRate } : {}),
      ...(a.source.hasSound !== undefined ? { hasSound: a.source.hasSound } : {}),
      scaled: a.details.scaled,
      ...(a.details.nativeWidth !== undefined
        ? { nativeWidth: a.details.nativeWidth, nativeHeight: a.details.nativeHeight }
        : {}),
      rotation: a.details.rotation,
      ...(a.details.firstTimestamp !== undefined ? { firstTimestamp: a.details.firstTimestamp } : {}),
      bitmap: a.bitmap !== undefined,
    })),
    refused: [...r.refused],
    notices: [...r.notices],
    cancelled: r.cancelled,
    progress,
  };
}

/** A few frames of 5120 × 2880 VP9 in WebM, or null when this browser can't encode it. */
async function make5k(): Promise<File | null> {
  const [w, h] = [5120, 2880];
  const config: VideoEncoderConfig = { codec: 'vp09.00.60.08', width: w, height: h, bitrate: 4_000_000, framerate: 30 };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) return null;
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const source = new EncodedVideoPacketSource('vp9');
  output.addVideoTrack(source, { frameRate: 30 });
  await output.start();
  const pending: Promise<void>[] = [];
  let failure: Error | null = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => pending.push(source.add(EncodedPacket.fromEncodedChunk(chunk), meta)),
    error: (e) => {
      failure = e;
    },
  });
  enc.configure(config);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 3; i++) {
    if (ctx) {
      ctx.fillStyle = `hsl(${i * 90} 60% 50%)`;
      ctx.fillRect(0, 0, w, h);
    }
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / 30), duration: Math.round(1e6 / 30) });
    enc.encode(frame, { keyFrame: i === 0 });
    frame.close();
  }
  await enc.flush();
  enc.close();
  if (failure) throw failure;
  await Promise.all(pending);
  await output.finalize();
  return new File([target.buffer ?? new ArrayBuffer(0)], 'screen-5k.webm');
}

const harness = {
  /** Intake of the files set on #files plus any generated ones, in order. */
  intakePicked: (cancelAt?: number) => runIntake(pickedFiles(), cancelAt),
  async add5k(): Promise<boolean> {
    const f = await make5k();
    if (f) extra.push(f);
    return f !== null;
  },
  async capabilities() {
    const caps = await probeCapabilities();
    return { ...caps, missing: deviceCheck(caps) };
  },
  exportGrid: (codec: VideoCodecId) => probeExportGrid(codec),
  trialVideo: (codec: VideoCodecId, w = 640, h = 360) => trialVideoEncode(videoEncoderConfig(codec, w, h, 30)),
  trialAudio: (codec: AudioCodecId) => trialAudioEncode(codec),
  /** MOD-Compositor, MOD-Engine and MOD-Preview (tests/harness/video.ts). */
  video: videoHarness,
  /** MOD-Export and MOD-Scratch (tests/harness/export.ts). */
  export: exportHarness,
  supportsDecode: async (codec: string) =>
    (await VideoDecoder.isConfigSupported({ codec, codedWidth: 1920, codedHeight: 1080 })).supported === true,
};

declare global {
  interface Window {
    harness: typeof harness;
  }
}
window.harness = harness;
document.getElementById('out')!.textContent = 'ready';
// The offline worker, as the app registers it (F-021): only in the production build of this page that
// the offline harness serves (TK_HARNESS_BUILD=offline); a no-op on the dev server.
registerOffline();
