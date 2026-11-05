// MOD-App — SCR-Editor (specs/30-experience/screens/SCR-Editor.md), empty state skeleton: regions in
// reading order toolbar, preview (CMP-EmptyState in its place), timeline, status bar. The inspector,
// media panel and overlays arrive with their features (phase 4). Layout widths (style.md "Layouts":
// wide ≥ 1000, compact 700–999, narrow < 700) are container queries on the tool root (NFR-07).
// `data-device` shows the RULE-22 check (F-023): media is accepted only once it reads "supported".
import { t } from '../copy';
import { isEmpty } from '../project';
import { device } from './device';
import { EmptyState } from './EmptyState';
import { SlowNotice } from './SlowNotice';
import { StatusBar } from './StatusBar';
import { Toolbar } from './Toolbar';
import { workersReady } from './workers';

export function Shell({ addRef }: { addRef: (el: HTMLButtonElement | null) => void }) {
  const empty = isEmpty.value;
  return (
    <div
      class="tk-editor"
      data-screen="SCR-Editor"
      data-state={empty ? 'empty' : 'default'}
      data-device={device.value.status}
      data-workers={workersReady.value.length}
    >
      <Toolbar />
      <main class="tk-preview-area" tabIndex={-1}>
        {empty ? <EmptyState addRef={addRef} /> : null}
        <SlowNotice />
      </main>
      <section class="tk-timeline" aria-label={t('timeline.label')} data-unavailable={empty ? '' : undefined} />
      <StatusBar />
    </div>
  );
}
