// MOD-Preview — full screen (F-002.R7, CMP-Preview "full screen (maximised)"). The browser's full
// screen on the preview element where the page may use it; otherwise maximised within the page (iPhone
// Safari has no element full screen, SP-ios; a host frame without the fullscreen permission refuses
// the request). Only the mode changes: the playhead and play state belong to the controller and are
// never touched (F-002.AC7). The UI styles the maximised mode; Esc leaves both (the browser leaves its
// own full screen, MOD-App's key binder leaves the maximised one).
// Implements: F-002.R7.
import { signal, type ReadonlySignal } from '@preact/signals';

export type FullscreenMode = 'off' | 'fullscreen' | 'maximised';

/** The parts of `document` full screen uses (a fake in unit tests). */
export interface FullscreenDoc {
  readonly fullscreenEnabled: boolean;
  readonly fullscreenElement: Element | null;
  exitFullscreen(): Promise<void>;
  addEventListener(type: 'fullscreenchange', fn: () => void): void;
  removeEventListener(type: 'fullscreenchange', fn: () => void): void;
}

export interface Fullscreen {
  readonly mode: ReadonlySignal<FullscreenMode>;
  /** Enters full screen, or maximises when the page may not; resolves with the mode reached. */
  enter(): Promise<FullscreenMode>;
  exit(): Promise<void>;
  toggle(): Promise<void>;
  dispose(): void;
}

/** One preview element's full-screen state. */
export function fullscreen(element: HTMLElement, doc: FullscreenDoc = document): Fullscreen {
  const mode = signal<FullscreenMode>('off');
  const onChange = (): void => {
    if (doc.fullscreenElement === element) mode.value = 'fullscreen';
    else if (mode.peek() === 'fullscreen') mode.value = 'off';
  };
  doc.addEventListener('fullscreenchange', onChange);

  const api: Fullscreen = {
    mode,
    async enter() {
      if (mode.peek() !== 'off') return mode.peek();
      if (doc.fullscreenEnabled && typeof element.requestFullscreen === 'function') {
        try {
          await element.requestFullscreen();
          mode.value = 'fullscreen';
          return 'fullscreen';
        } catch {
          // Refused (no permission in a host frame, no user gesture): maximise in the page instead.
        }
      }
      mode.value = 'maximised';
      return 'maximised';
    },
    async exit() {
      const was = mode.peek();
      mode.value = 'off';
      if (was === 'fullscreen' && doc.fullscreenElement === element) await doc.exitFullscreen().catch(() => undefined);
    },
    toggle: () => (mode.peek() === 'off' ? api.enter().then(() => undefined) : api.exit()),
    dispose() {
      doc.removeEventListener('fullscreenchange', onChange);
    },
  };
  return api;
}

/**
 * MOD-Preview `enterFullscreen()`: full screen for an element, maximised where it is not allowed. Returns
 * the handle, whose `exit()` leaves and `dispose()` stops listening (nothing is left behind).
 */
export async function enterFullscreen(element: HTMLElement, doc: FullscreenDoc = document): Promise<Fullscreen> {
  const fs = fullscreen(element, doc);
  await fs.enter();
  return fs;
}
