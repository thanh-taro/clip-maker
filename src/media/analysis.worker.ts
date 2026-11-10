// MOD-Media — the analysis worker (ADR-0003 §4): probes new files off the main thread so the editor
// stays usable while sources are checked (F-001.R6). A video's first frame comes back as the media panel's thumbnail (F-001);
// timeline thumbnails and waveforms come with F-003.
import { helloFrom, type FromWorker, type WorkerScope } from '../core';
import { probeFile } from './probe';
import type { FromAnalysis, ToAnalysis } from './types';

const scope = self as unknown as WorkerScope<ToAnalysis, FromWorker | FromAnalysis>;
const running = new Map<number, AbortController>();

async function probe(id: number, file: File, rate: Parameters<typeof probeFile>[1]): Promise<void> {
  const ctl = new AbortController();
  running.set(id, ctl);
  try {
    const outcome = await probeFile(file, rate, ctl.signal);
    if (ctl.signal.aborted) {
      if (outcome.ok) {
        outcome.probed.bitmap?.close();
        outcome.probed.thumbnail?.close();
      }
      scope.postMessage({ type: 'cancelled', id });
      return;
    }
    const bitmaps = outcome.ok ? [outcome.probed.bitmap, outcome.probed.thumbnail].filter((b) => !!b) : [];
    scope.postMessage({ type: 'probed', id, outcome }, bitmaps);
  } catch (e) {
    if (ctl.signal.aborted) scope.postMessage({ type: 'cancelled', id });
    // An unexpected failure is still a refusal, never a hang: nothing usable was read.
    else {
      console.error('analysis: probe failed', e);
      scope.postMessage({ type: 'probed', id, outcome: { ok: false, reason: 'reason.no_media' } });
    }
  } finally {
    running.delete(id);
  }
}

scope.onmessage = (e: MessageEvent<ToAnalysis>) => {
  const m = e.data;
  if (m?.type === 'hello') scope.postMessage(helloFrom('analysis'));
  else if (m?.type === 'probe') void probe(m.id, m.file, m.rate);
  else if (m?.type === 'cancel') running.get(m.id)?.abort();
};
