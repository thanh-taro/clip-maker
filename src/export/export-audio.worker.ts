// MOD-Export — the export-audio worker (ADR-0003 outcome: two workers per export; ADR-0008 outcome
// item 2; ADR-0010 outcome item 1). Mixes the project with MOD-Audio's mixer and limiter, encodes, decodes
// and measures, trims (verify-and-trim) and hands the packets — or the WAV stream — to the export worker
// over a port, alongside the video. Created idle at start-up; terminated on cancel.
// The clips' sound arrives decoded (48 kHz stereo, as the audio worker's `audio:pcm`) until windowed
// decoding is built (MOD-Audio, ADR-0008 §6); see build-spec-questions Q33.
import { endSampleOf, pcmSource, type SoundSource } from '../audio';
import { audioEncoderConfig } from '../codec';
import { helloFrom, type AudioPortMessage, type FromExportAudio, type ToExportAudio, type WorkerScope } from '../core';
import { voices } from '../plan';
import { lossyAudio, wavAudio, webCodecsAudio, type MixJob } from './audio-pass';
import { errorText } from './encoder';
import { PROGRESS_POST_MS } from './watch';

const scope = self as unknown as WorkerScope<ToExportAudio, FromExportAudio>;

scope.onmessage = (e: MessageEvent<ToExportAudio>) => {
  const m = e.data;
  if (m?.type === 'hello') {
    scope.postMessage(helloFrom('export-audio') as FromExportAudio);
    return;
  }
  if (m?.type !== 'exportAudio:start') return;
  const port = m.port;
  const send = (msg: AudioPortMessage, transfer: Transferable[] = []): void => port.postMessage(msg, transfer);
  const sources = new Map<string, SoundSource>(m.pcm.map((p) => [p.sourceId, pcmSource(p.L, p.R)]));
  // The whole project, to its end (INV-07): the same length as the video's sound (NFR-08).
  const job: MixJob = { voices: voices(m.project), bank: (id) => sources.get(id), endSample: endSampleOf(m.project) };
  let last = -Infinity;
  const progress = (done: number, total: number): void => {
    const t = performance.now();
    if (t - last < PROGRESS_POST_MS && done < total) return;
    last = t;
    scope.postMessage({ type: 'exportAudio:progress', done, total });
  };
  void (async () => {
    try {
      if (m.codec === 'pcm16') {
        const r = await wavAudio(job, (b) => send({ type: 'pcm', bytes: b }, [b.buffer]), progress);
        send({ type: 'end', frames: r.frames });
        scope.postMessage({ type: 'exportAudio:done', trim: null });
      } else {
        const r = await lossyAudio(
          job,
          audioEncoderConfig(m.codec, m.bitrate),
          m.encoderDelay,
          webCodecsAudio,
          m.gainDb,
          progress,
        );
        send(
          { type: 'packets', decoderConfig: r.decoderConfig, packets: r.packets },
          r.packets.map((p) => p.data.buffer),
        );
        scope.postMessage({ type: 'exportAudio:done', trim: r.trim });
      }
    } catch (err) {
      const message = errorText(err);
      send({ type: 'failed', message });
      scope.postMessage({ type: 'exportAudio:failed', message });
    }
  })();
};
