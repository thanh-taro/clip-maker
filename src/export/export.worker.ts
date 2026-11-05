// MOD-Export — the export (video) worker (ADR-0003 §5 and outcome, ADR-0010): plan → decode → paint →
// encode → mux into a sink. Created idle at start-up; one job per worker; terminated on cancel (NFR-11).
import { helloFrom, type FromExport, type ToExport, type WorkerScope } from '../core';
import { calibrationRanges, projectFrames } from '../core';
import { browserStorage } from '../scratch';
import { errorText, StageError } from './encoder';
import { runCalibration, runExport } from './pipeline';

const scope = self as unknown as WorkerScope<ToExport, FromExport>;
const post = (m: FromExport, transfer: Transferable[] = []): void => scope.postMessage(m, transfer);
let dropSink: (() => Promise<void>) | null = null;
const onSink = (d: () => Promise<void>): void => void (dropSink = d);

scope.onmessage = (e: MessageEvent<ToExport>) => {
  const m = e.data;
  if (m?.type === 'hello') post(helloFrom('export') as FromExport);
  else if (m?.type === 'export:start') void runExport(m.job, { storage: browserStorage().storage, post, onSink });
  else if (m?.type === 'export:abort') {
    // Close the sync handles and delete the files before the worker is terminated (an open handle
    // makes the delete fail everywhere, SP-storage).
    const d = dropSink;
    dropSink = null;
    void (d ? d() : Promise.resolve()).catch(() => undefined).then(() => post({ type: 'export:aborted' }));
  } else if (m?.type === 'export:calibrate') {
    const frames = projectFrames(m.job.project);
    const rate = m.job.project.frame.frameRate;
    runCalibration(m.job, calibrationRanges(frames, rate))
      .then((cal) => post({ type: 'export:calibration', cal }))
      .catch((err: unknown) =>
        post({
          type: 'export:failed',
          error:
            err instanceof StageError
              ? { kind: err.kind, message: err.message }
              : { kind: 'internal', message: errorText(err) },
        }),
      );
  }
};
