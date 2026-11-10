// MOD-App — SCR-Editor (specs/30-experience/screens/SCR-Editor.md): regions in reading order toolbar,
// media panel (left drawer, F-001), preview (CMP-Preview with its transport, F-002; CMP-EmptyState in
// the frame's place while empty), timeline (CMP-Timeline, F-003), on narrow layouts the open tab sheet
// and the tab bar (D-038), status bar; then the overlays: CMP-Notice stack (in the preview area) and
// CMP-DropOverlay. The inspector and the other overlays arrive with their features (phase 4). Layout
// widths (style.md "Layouts": wide ≥ 1000, compact 700–999, narrow < 700) are container queries on the
// tool root (NFR-07). `data-device` shows the RULE-22 check (F-023): media is accepted only once it
// reads "supported". `data-state` follows SCR-Editor's states: empty, default, selected, playing,
// adding, dragging-file.
import { useEffect, useRef } from 'preact/hooks';
import { isEmpty } from '../project';
import { panelOpen, progress } from './adding';
import { selectedClip } from './arrange';
import { device } from './device';
import { EditSheet, openSheet, TabBar } from './EditSheet';
import { DropOverlay, dragging, FilePicker, useMediaInput } from './MediaInput';
import { MediaPanel } from './MediaPanel';
import { playback } from './playback';
import { PreviewArea } from './Preview';
import { StatusBar } from './StatusBar';
import { Timeline } from './Timeline';
import { Toolbar } from './Toolbar';
import { workersReady } from './workers';

/** SCR-Editor "States" this feature shows (the others come with their features). */
function stateOf(empty: boolean): string {
  if (dragging.value) return 'dragging-file';
  if (progress.value) return 'adding';
  if (playback.value?.ctl.state.value === 'playing') return 'playing';
  if (selectedClip.value) return 'selected';
  return empty ? 'empty' : 'default';
}

/**
 * CMP-Notice "placement · narrow" (build-spec-questions 74e, decided): while a sheet that overlays the
 * editor is open (the media panel's narrow sheet), the notice stack sits just above it. The docked tab
 * sheets leave the stack where it is, above the transport. `--notice-lift` is how far the stack
 * moves up.
 */
function useNoticeLift(editor: { readonly current: HTMLElement | null }): void {
  useEffect(() => {
    const root = editor.current;
    if (!root) return undefined;
    let watched: HTMLElement | null = null;
    const update = (): void => {
      const sheet = root.querySelector<HTMLElement>('.tk-media[data-variant="sheet"]');
      const stage = root.querySelector<HTMLElement>('.tk-stage');
      if (sheet !== watched) {
        if (watched) sizes.unobserve(watched);
        if (sheet) sizes.observe(sheet);
        watched = sheet;
      }
      const lift =
        sheet && stage ? Math.max(0, stage.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top) : 0;
      root.style.setProperty('--notice-lift', `${Math.round(lift)}px`);
    };
    const sizes = new ResizeObserver(update);
    sizes.observe(root);
    const children = new MutationObserver(update);
    children.observe(root, { childList: true });
    update();
    return () => {
      sizes.disconnect();
      children.disconnect();
    };
  }, []);
}

export function Shell({ addRef }: { addRef: (el: HTMLButtonElement | null) => void }) {
  useMediaInput();
  const empty = isEmpty.value;
  const root = useRef<HTMLDivElement>(null);
  useNoticeLift(root);
  return (
    <div
      ref={root}
      class="tk-editor"
      data-screen="SCR-Editor"
      data-state={stateOf(empty)}
      data-device={device.value.status}
      data-workers={workersReady.value.length}
      data-panel={panelOpen.value ? 'open' : undefined}
      data-sheet={openSheet.value ?? undefined}
    >
      <Toolbar />
      <MediaPanel />
      <PreviewArea addRef={addRef} />
      <Timeline />
      <EditSheet />
      <TabBar />
      <StatusBar />
      <DropOverlay />
      <FilePicker />
    </div>
  );
}
