// MOD-Export — the export (video) worker (ADR-0003 §5 and outcome, ADR-0010): plan → decode → paint →
// encode → mux into a sink. Created idle at start-up; one job per worker; terminated on cancel (NFR-11).
import { calibrationRanges, helloFrom, projectFrames, type FromExport, type ToExport, type WorkerScope } from '../core';
import { browserStorage } from '../scratch';
import { AbortGate } from './control';
import { errorText } from './encoder';
import { runCalibration, runExport } from './pipeline';

const scope = self as unknown as WorkerScope<ToExport, FromExport>;
const post = (m: FromExport, transfer: Transferable[] = []): void => scope.postMessage(m, transfer);
const gate = new AbortGate();

scope.onmessage = (e: MessageEvent<ToExport>) => {
  const m = e.data;
  if (m?.type === 'hello') post(helloFrom('export') as FromExport);
  else if (m?.type === 'export:start') void runExport(m.job, { storage: browserStorage().storage, post, gate });
  // Close the sync handles and delete the files before the worker is terminated (an open handle makes
  // the delete fail everywhere, SP-storage); an abort that comes before the sink opens is remembered.
  else if (m?.type === 'export:abort') void gate.abort().then(() => post({ type: 'export:aborted' }));
  else if (m?.type === 'export:calibrate') {
    const frames = projectFrames(m.job.project);
    const rate = m.job.project.frame.frameRate;
    const id = m.id;
    runCalibration(m.job, calibrationRanges(frames, rate))
      .then((cal) => post({ type: 'export:calibration', id, cal }))
      .catch((err: unknown) => post({ type: 'export:calibrationFailed', id, message: errorText(err) }));
  }
};
