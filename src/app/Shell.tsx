// MOD-App — SCR-Editor (specs/30-experience/screens/SCR-Editor.md): regions in reading order toolbar,
// media panel (left drawer, F-001), preview (CMP-EmptyState in its place while empty), timeline,
// status bar; then the overlays: CMP-Notice stack (in the preview area) and CMP-DropOverlay. The
// inspector, the timeline view and the other overlays arrive with their features (phase 4). Layout
// widths (style.md "Layouts": wide ≥ 1000, compact 700–999, narrow < 700) are container queries on the
// tool root (NFR-07). `data-device` shows the RULE-22 check (F-023): media is accepted only once it
// reads "supported". `data-state` follows SCR-Editor's states: empty, default, adding, dragging-file.
import { t } from '../copy';
import { isEmpty } from '../project';
import { panelOpen, progress } from './adding';
import { device } from './device';
import { EmptyState } from './EmptyState';
import { DropOverlay, dragging, FilePicker, useMediaInput } from './MediaInput';
import { MediaPanel } from './MediaPanel';
import { Notices } from './NoticeStack';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { workersReady } from './workers';

/** SCR-Editor "States" this feature shows (the others come with their features). */
function stateOf(empty: boolean): string {
  if (dragging.value) return 'dragging-file';
  if (progress.value) return 'adding';
  return empty ? 'empty' : 'default';
}

export function Shell({ addRef }: { addRef: (el: HTMLButtonElement | null) => void }) {
  useMediaInput();
  const empty = isEmpty.value;
  return (
    <div
      class="tk-editor"
      data-screen="SCR-Editor"
      data-state={stateOf(empty)}
      data-device={device.value.status}
      data-workers={workersReady.value.length}
      data-panel={panelOpen.value ? 'open' : undefined}
    >
      <Toolbar />
      <MediaPanel />
      <main class="tk-preview-area" tabIndex={-1}>
        {empty ? <EmptyState addRef={addRef} /> : null}
        <Notices />
      </main>
      <section class="tk-timeline" aria-label={t('timeline.label')} data-unavailable={empty ? '' : undefined} />
      <StatusBar />
      <DropOverlay />
      <FilePicker />
    </div>
  );
}
