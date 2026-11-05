// MOD-Audio — the audio worker (ADR-0003 §3, ADR-0008 §1/§5): runs the same mixer as every export and
// streams 48 kHz stereo blocks 400 ms ahead of the worklet over a transferred MessagePort.
// Implements: F-002.R2 (sound with picture), F-011.R5 (the preview plays the export's mix), INV-02.
import { helloFrom, type FromWorker, type WorkerScope } from '../core';
import { Streamer } from './stream';
import { pcmSource, type SoundSource } from './source';
import type { ToAudioWorker } from './protocol';

const scope = self as unknown as WorkerScope<ToAudioWorker, FromWorker>;
const sources = new Map<string, SoundSource>();
const streamer = new Streamer((id) => sources.get(id));

scope.onmessage = (e: MessageEvent<ToAudioWorker>) => {
  const d = e.data;
  switch (d?.type) {
    case 'hello':
      scope.postMessage(helloFrom('audio'));
      break;
    case 'audio:port':
      streamer.connect(d.port);
      break;
    case 'audio:pcm':
      sources.set(d.sourceId, pcmSource(d.L, d.R));
      streamer.sourcesChanged();
      break;
    case 'audio:setProject':
      streamer.setProject(d.project);
      break;
    case 'audio:play':
      streamer.play(d.from, d.gen);
      break;
    case 'audio:pause':
      streamer.pause(d.gen);
      break;
    case 'audio:seek':
      streamer.seek(d.t, d.gen);
      break;
  }
};
