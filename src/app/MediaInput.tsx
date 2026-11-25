// MOD-App — the three ways files come in (F-001.R1; MOD-App "pick/drop/paste wiring"):
//   - the system file picker for video, photo and audio, opened by every Add media (CMP-Toolbar,
//     CMP-EmptyState, CMP-MediaPanel). A wide Add media outside the panel also opens the panel's left
//     drawer (style.md "Layouts"; build-spec-questions 71). Music (F-011.R1, D-052) opens the same picker
//     offering audio files, and its pick goes through the same intake as a music pick (./adding.ts);
//   - dropping files anywhere on the tool, embedded or standalone, with CMP-DropOverlay while files (not
//     text or links) are dragged over it; it disappears on drop, on leaving the tool, or on Esc;
//   - the `paste` event (no clipboard permission): pasted files are added, text and links are ignored and
//     never fetched (F-001.AC10, NFR-01).
// Nothing is dropped onto the page's default handler, so a dropped link or file never navigates away.
// Files picked, dropped or pasted before the device check has let media in are queued (./adding.ts).
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { t } from '../copy';
import { addFiles, openPanel, pickerClosed } from './adding';
import { Icon } from './icons';
import { carriesFiles, filesFromPaste, itemsFromDrop, pasteTargetsField, pastes } from './transfer';

let input: HTMLInputElement | null = null;
const ACCEPT_ALL = 'video/*,image/*,audio/*';
/**
 * F-011.R1 / CMP-Toolbar: the audio types RULE-01 accepts (MP3, AAC/M4A, WAV, Ogg/Opus, FLAC, WebM audio).
 * Only a hint to the picker: every file is still checked by its contents (RULE-01).
 */
export const ACCEPT_AUDIO = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.weba';
/** The open picker was opened by Music: its files are a music pick (F-011.R1). */
let musicPick = false;

/** Implements: F-001.R1 — opens the system file picker (several files at once). */
export function pickFiles(): void {
  if (!input) return;
  input.accept = ACCEPT_ALL;
  musicPick = false;
  input.click();
}

/**
 * Implements: F-011.R1, CMP-Toolbar — Music opens the system file picker for audio files (several at
 * once). The chosen files go through the F-001 intake and are placed at the playhead (`addFiles` with
 * `music`); cancelling changes nothing.
 */
export function pickMusic(): void {
  if (!input) return;
  input.accept = ACCEPT_AUDIO;
  musicPick = true;
  input.click();
}

/** Add media outside the media panel: the panel opens (left drawer, or the narrow sheet) and the picker. */
export function addMedia(e?: { currentTarget: EventTarget | null }): void {
  // The button that was activated (WebKit doesn't focus a clicked button, so focus can't tell).
  openPanel((e?.currentTarget as Element | null) ?? document.activeElement);
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
      accept={ACCEPT_ALL}
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const el = e.currentTarget;
        const files = Array.from(el.files ?? []);
        const music = musicPick;
        musicPick = false;
        el.value = '';
        el.accept = ACCEPT_ALL;
        pickerClosed.value++;
        if (files.length) void addFiles(files, { music });
      }}
      // The picker was dismissed without a choice (F-011.AC12: nothing changes).
      onCancel={(e) => {
        e.currentTarget.accept = ACCEPT_ALL;
        musicPick = false;
        pickerClosed.value++;
      }}
    />
  );
}

/**
 * Implements: F-001.R5, NFR-01 — installed by `main()` before any screen renders (SCR-Unsupported too):
 * the browser never opens a dropped file or follows a dropped link, which would leave the tool.
 */
export function guardDrops(doc: Document = document): void {
  const stop = (e: Event) => e.preventDefault();
  doc.addEventListener('dragover', stop);
  doc.addEventListener('drop', stop);
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
      // The page-wide guard (guardDrops) already keeps the browser from opening a dropped file or link.
      if (e.dataTransfer) e.dataTransfer.dropEffect = carriesFiles(e.dataTransfer) ? 'copy' : 'none';
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      // Enter and leave come in pairs per element; the count reaches 0 when the drag leaves the tool.
      // A leave with nothing under the pointer outside the page also ends it (some engines skip pairs);
      // inside the page WebKit reports no related target for every move, so position decides.
      depth = Math.max(0, depth - 1);
      const outside =
        e.relatedTarget === null &&
        (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight);
      if (depth === 0 || outside) hide();
    };
    const onDrop = (e: DragEvent) => {
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
      pastes.files++;
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
