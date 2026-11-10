// MOD-App — the three ways files come in (F-001.R1; MOD-App "pick/drop/paste wiring"):
//   - the system file picker for video, photo and audio, opened by every Add media (CMP-Toolbar,
//     CMP-EmptyState, CMP-MediaPanel). A wide Add media outside the panel also opens the panel's left
//     drawer (style.md "Layouts"; build-spec-questions 71);
//   - dropping files anywhere on the tool, embedded or standalone, with CMP-DropOverlay while files (not
//     text or links) are dragged over it; it disappears on drop, on leaving the tool, or on Esc;
//   - the `paste` event (no clipboard permission): pasted files are added, text and links are ignored and
//     never fetched (F-001.AC10, NFR-01).
// Nothing is dropped onto the page's default handler, so a dropped link or file never navigates away.
// Files picked, dropped or pasted before the device check has let media in are queued (./adding.ts).
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { t } from '../copy';
import { addFiles, openPanel } from './adding';
import { Icon } from './icons';
import { carriesFiles, filesFromPaste, itemsFromDrop, pasteTargetsField } from './transfer';

let input: HTMLInputElement | null = null;

/** Implements: F-001.R1 — opens the system file picker (several files at once). */
export function pickFiles(): void {
  input?.click();
}

/** Add media outside the media panel: the panel opens (left drawer, or the narrow sheet) and the picker. */
export function addMedia(): void {
  openPanel();
  pickFiles();
}

/** The hidden file input behind every Add media. Its value is cleared, so the same file can be picked again. */
export function FilePicker() {
  return (
    <input
      ref={(el) => {
        input = el;
      }}
      class="tk-file-input"
      type="file"
      multiple
      accept="video/*,image/*,audio/*"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const el = e.currentTarget;
        const files = Array.from(el.files ?? []);
        el.value = '';
        if (files.length) void addFiles(files);
      }}
    />
  );
}

/** CMP-DropOverlay is showing. */
export const dragging = signal(false);

/**
 * Implements: F-001.R1, CMP-DropOverlay, CMP-EmptyState "pasting files adds them" — document-wide
 * drag, drop and paste handling for the tool's lifetime.
 */
export function useMediaInput(): void {
  useEffect(() => {
    let depth = 0;
    let escaped = false;
    const hide = () => {
      depth = 0;
      escaped = false;
      dragging.value = false;
    };
    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      depth++;
      if (!escaped) dragging.value = true;
    };
    const onOver = (e: DragEvent) => {
      // Every drag is handled here, so the browser never opens a dropped file or link itself.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = carriesFiles(e.dataTransfer) ? 'copy' : 'none';
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      // Enter and leave come in pairs per element; the count reaches 0 when the drag leaves the tool.
      depth = Math.max(0, depth - 1);
      if (depth === 0) hide();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const items = itemsFromDrop(e.dataTransfer);
      hide();
      if (items.length) void addFiles(items);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragging.value) {
        escaped = true;
        dragging.value = false;
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (pasteTargetsField(e.target)) return;
      const files = filesFromPaste(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files);
    };
    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
}

/**
 * CMP-DropOverlay (board CMP-DropOverlay): a scrim over the whole tool, a dashed accent outline inset
 * from the edges and a centred card with an upload icon, COPY-drop.hint and COPY-drop.kinds. The hint
 * sits in a polite live region that always exists, so screen-reader users dragging files hear it.
 */
export function DropOverlay() {
  const on = dragging.value;
  return (
    <div class="tk-drop" data-open={on ? '' : undefined} aria-live="polite">
      {on ? (
        <div class="tk-drop__frame">
          <div class="tk-drop__card">
            <Icon name="upload" size={24} class="tk-drop__icon" />
            <p class="tk-drop__hint">{t('drop.hint')}</p>
            <p class="tk-drop__kinds">{t('drop.kinds')}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
