// MOD-Audio — the audio worker (ADR-0003 §3, ADR-0008 §1/§5/§6): runs the same mixer as every export and
// streams 48 kHz stereo blocks 400 ms ahead of the worklet over a transferred MessagePort. The sources'
// sound is decoded here, windowed (≈ 2 s ahead per active voice), from encoded packets the engine worker
// reads (the sound feed, MOD-Container; this worker's budget can't hold the reader, build question 83).
// Implements: F-002.R2 (sound with picture), F-011.R5 (the preview plays the export's mix), INV-02, NFR-05.
import { helloFrom, type FromWorker, type Project, type WorkerScope } from '../core';
import { portFeed, SoundBank } from './decode';
import { pcmSource, type SoundSource } from './source';
import { Streamer } from './stream';
import type { ToAudioWorker } from './protocol';

const scope = self as unknown as WorkerScope<ToAudioWorker, FromWorker>;
/** Sound given whole (`audio:pcm`: tests and the harness); it takes the place of decoding. */
const given = new Map<string, SoundSource>();
let bank: SoundBank | null = null;
let project: Project | null = null;
const streamer = new Streamer((id) => given.get(id) ?? bank?.get(id), undefined, undefined, {
  want: (d) => bank?.want(d.filter((x) => !given.has(x.sourceId))),
  ready: (d) => bank?.ready(d.filter((x) => !given.has(x.sourceId))) ?? true,
});

/** The sources whose sound is decoded: every source with sound that was not given whole. */
function soundSources(): void {
  if (!bank || !project) return;
  bank.setSources(
    project.sources.filter((s) => (s.kind === 'audio' || s.hasSound === true) && !given.has(s.id)).map((s) => s.id),
  );
}

scope.onmessage = (e: MessageEvent<ToAudioWorker>) => {
  const d = e.data;
  switch (d?.type) {
    case 'hello':
      scope.postMessage(helloFrom('audio'));
      break;
    case 'audio:port':
      streamer.connect(d.port);
      break;
    case 'audio:feed':
      bank?.dispose();
      bank = new SoundBank(portFeed(d.port), undefined, () => streamer.decoded());
      soundSources();
      break;
    case 'audio:pcm':
      given.set(d.sourceId, pcmSource(d.L, d.R));
      soundSources();
      streamer.sourcesChanged();
      break;
    case 'audio:setProject':
      project = d.project;
      soundSources();
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
