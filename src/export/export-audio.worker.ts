// MOD-Export — the export-audio worker (ADR-0003 outcome: two workers per export; ADR-0008 outcome
// item 2; ADR-0010 outcome item 1). Mixes the project with MOD-Audio's mixer and limiter, encodes, decodes
// and measures, trims (verify-and-trim) and hands the packets — or the WAV stream — to the export worker
// over a port, alongside the video. Created idle at start-up; terminated on cancel.
// The clips' sound is decoded here with MOD-Audio's windowed decoder (ADR-0008 §6), block by block in
// mix order with ≈ 2 s ahead, from encoded packets the export worker reads (the sound feed; build
// questions 33, 83): memory stays bounded however long the sources are (NFR-05). A decode error fails
// the export (AudioCodecError); sound is never dropped silently.
import { endSampleOf, offlinePrepare, pcmSource, portFeed, SoundBank, type SoundSource } from '../audio';
import { audioEncoderConfig } from '../codec';
import { helloFrom, type AudioPortMessage, type FromExportAudio, type ToExportAudio, type WorkerScope } from '../core';
import { voices } from '../plan';
import { AudioCodecError, lossyAudio, wavAudio, webCodecsAudio, type MixJob } from './audio-pass';
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
  const all = voices(m.project);
  // Strict: a codec this device can't decode fails the export like a decode error (question 33).
  const decoded = new SoundBank(portFeed(m.feed ?? new MessageChannel().port1), undefined, undefined, true);
  // Without a feed nothing can be decoded: such sources are heard as silence (an export always has one).
  decoded.setSources(
    m.feed
      ? m.project.sources
          .filter((s) => (s.kind === 'audio' || s.hasSound === true) && !sources.has(s.id))
          .map((s) => s.id)
      : [],
  );
  const heard = all.filter((v) => !sources.has(v.sourceId));
  // The whole project, to its end (INV-07): the same length as the video's sound (NFR-08).
  const job: MixJob = {
    voices: all,
    bank: (id) => sources.get(id) ?? decoded.get(id),
    endSample: endSampleOf(m.project),
    prepare: offlinePrepare(decoded, heard, (message) => new AudioCodecError(message)),
  };
  let last = -Infinity;
  let lastAlive = -Infinity;
  const progress = (done: number, total: number): void => {
    const t = performance.now();
    if (t - last < PROGRESS_POST_MS && done < total) return;
    last = t;
    scope.postMessage({ type: 'exportAudio:progress', done, total });
  };
  // Liveness over the port (the export worker's sound-wait watchdog) and to the main thread (the
  // interruption rules count it while the video worker waits for the sound).
  const alive = (): void => {
    const t = performance.now();
    if (t - lastAlive < PROGRESS_POST_MS) return;
    lastAlive = t;
    send({ type: 'alive' });
    scope.postMessage({ type: 'exportAudio:alive' });
  };
  void (async () => {
    try {
      if (m.codec === 'pcm16') {
        // ADR-0008 outcome item 2: the project's final gain is shared by every export of the mix.
        const gainDb = m.gainDb ?? 0;
        const r = await wavAudio(
          job,
          (b) => {
            send({ type: 'pcm', bytes: b }, [b.buffer]);
            alive();
          },
          progress,
          gainDb,
        );
        const trim = { gainDb, peakDb: null, passes: 1, fallback: false };
        send({ type: 'end', frames: r.frames, trim });
        scope.postMessage({ type: 'exportAudio:done', trim: null });
      } else {
        const r = await lossyAudio(
          job,
          audioEncoderConfig(m.codec, m.bitrate),
          m.encoderDelay,
          webCodecsAudio,
          m.gainDb,
          progress,
          alive,
        );
        send(
          { type: 'packets', decoderConfig: r.decoderConfig, packets: r.packets, trim: r.trim },
          r.packets.map((p) => p.data.buffer),
        );
        scope.postMessage({ type: 'exportAudio:done', trim: r.trim });
      }
    } catch (err) {
      const message = errorText(err);
      const kind = err instanceof AudioCodecError ? 'encoder' : 'other';
      send({ type: 'failed', kind, message });
      scope.postMessage({ type: 'exportAudio:failed', kind, message });
    } finally {
      decoded.dispose();
    }
  })();
};
