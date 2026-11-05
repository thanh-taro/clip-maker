// MOD-Audio playback in real engines (ADR-0008 §5 and outcome rule 6): the built audio worker streams
// the mix 400 ms ahead over a MessagePort to the built worklet, under the production CSP. The context
// is created inside a click (user gesture). Plays ~4 s with no underrun, the worklet's clock advances,
// and the samples it played hash-equal the export render of the same project (INV-02).
// The main-thread controller (Playback) is unit-tested with fakes; its e2e comes with F-002's Play.
import { expect, test } from '@playwright/test';
import { endSampleOf } from '../../src/audio/stream';
import { renderOffline } from '../../src/audio/mixer';
import { pcmSource } from '../../src/audio/source';
import { voices } from '../../src/plan';
import { proj, video } from '../support/project';

const SR = 48_000;
const SECONDS = 4;

function tone(seconds: number, freq: number, amp: number): number[] {
  return Array.from({ length: seconds * SR }, (_, i) => Math.fround(amp * Math.sin((2 * Math.PI * freq * i) / SR)));
}

function fnv(a: Float32Array, n: number): string {
  const u = new Uint8Array(a.buffer, a.byteOffset, n * 4);
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i]!, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

test(
  'MOD-Audio the worklet plays the audio worker’s mix for 4 s with 0 underruns, as rendered for export',
  { tag: '@realtime' },
  async ({ page }) => {
    test.setTimeout(60_000);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/');
    await expect(page.locator('[data-screen="SCR-Editor"]')).toHaveAttribute('data-workers', '5');

    const workerUrl = requests.find((u) => /\/assets\/audio\.worker-[^/]+\.js$/.test(u));
    expect(workerUrl).toBeTruthy();
    const workletUrl = await page
      .locator('link[rel="modulepreload"][href*="playback.worklet"]')
      .evaluate((el) => (el as HTMLLinkElement).href);

    // A 2× clip of a stereo tone with a fade: WSOLA, fades and the limiter all run.
    const project = proj({ clips: [video('a', 10, { speedPct: 200, fadeIn: 500_000, volume: 180 })] });
    const L = tone(12, 440, 0.6);
    const R = tone(12, 660, 0.6);

    await page.evaluate(
      ({ workerUrl, workletUrl, project, L, R }) => {
        const button = document.createElement('button');
        button.textContent = 'e2e play';
        button.id = 'e2e-play';
        button.onclick = () => {
          // In the gesture: create the context and ask it to resume (bounded elsewhere; not awaited).
          const ctx = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
          void ctx.resume();
          const run = async () => {
            await ctx.audioWorklet.addModule(workletUrl);
            const node = new AudioWorkletNode(ctx, 'clipmaker-playback', {
              numberOfInputs: 0,
              numberOfOutputs: 1,
              outputChannelCount: [2],
            });
            const quiet = ctx.createGain();
            quiet.gain.value = 0.0001; // −80 dB: the graph runs, nothing is heard
            node.connect(quiet).connect(ctx.destination);
            const state = { positions: [] as { sample: number; frame: number }[], stats: null as unknown };
            node.port.onmessage = (e: MessageEvent) => {
              if (e.data.type === 'position') state.positions.push({ sample: e.data.sample, frame: e.data.frame });
              if (e.data.type === 'stats') state.stats = e.data.stats;
            };
            const worker = new Worker(workerUrl, { type: 'module' });
            const ch = new MessageChannel();
            node.port.postMessage({ type: 'connect', port: ch.port2 }, [ch.port2]);
            worker.postMessage({ type: 'audio:port', port: ch.port1 }, [ch.port1]);
            const l = Float32Array.from(L);
            const r = Float32Array.from(R);
            worker.postMessage({ type: 'audio:pcm', sourceId: 'src-a', L: l, R: r }, [l.buffer, r.buffer]);
            worker.postMessage({ type: 'audio:setProject', project });
            worker.postMessage({ type: 'audio:play', from: 0, gen: 1 });
            (window as unknown as { e2eAudio: unknown }).e2eAudio = { ctx, node, state };
          };
          void run();
        };
        document.body.append(button);
      },
      { workerUrl: workerUrl!, workletUrl, project, L, R },
    );
    await page.click('#e2e-play');

    // The context may need a moment to start (WebKit); wait until it runs, at most 2 s (bounded).
    await page.waitForFunction(
      () => (window as unknown as { e2eAudio?: { ctx: AudioContext } }).e2eAudio?.ctx.state === 'running',
      undefined,
      { timeout: 2_000 },
    );
    await page.waitForTimeout(SECONDS * 1000);

    const result = await page.evaluate(async () => {
      const a = (
        window as unknown as {
          e2eAudio: { node: AudioWorkletNode; state: { positions: { sample: number }[]; stats: unknown } };
        }
      ).e2eAudio;
      a.state.stats = null;
      a.node.port.postMessage({ type: 'stats' });
      for (let i = 0; i < 50 && !a.state.stats; i++) await new Promise((r) => setTimeout(r, 20));
      return { stats: a.state.stats, positions: a.state.positions.length, last: a.state.positions.at(-1)?.sample ?? 0 };
    });
    const stats = result.stats as {
      underrunQuanta: number;
      underrunEvents: number;
      lowWater: number;
      played: number;
      hashL: string;
      hashR: string;
      hashed: number;
    };

    expect(stats.underrunQuanta).toBe(0);
    expect(stats.underrunEvents).toBe(0);
    expect(stats.played).toBeGreaterThan((SECONDS - 1) * SR);
    expect(result.positions).toBeGreaterThan(50);
    expect(result.last).toBeGreaterThan((SECONDS - 1) * SR); // the clock advanced with the sound

    // What the worklet played equals the export render of the same samples (INV-02).
    const end = endSampleOf(project);
    const eL = new Float32Array(end);
    const eR = new Float32Array(end);
    const src = pcmSource(Float32Array.from(L), Float32Array.from(R));
    renderOffline(
      voices(project),
      (id) => (id === 'src-a' ? src : undefined),
      end,
      (l, r, at) => {
        eL.set(l, at);
        eR.set(r, at);
      },
    );
    expect(stats.hashed).toBeGreaterThan(0);
    expect(stats.hashL).toBe(fnv(eL, stats.hashed));
    expect(stats.hashR).toBe(fnv(eR, stats.hashed));
  },
);
