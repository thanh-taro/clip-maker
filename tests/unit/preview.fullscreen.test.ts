// MOD-Preview full screen (F-002.R7, CMP-Preview "full screen (maximised)"): the browser's full screen
// where the page may use it, else maximised within the page (iPhone Safari, a host frame without the
// fullscreen permission). Playback and the playhead are never touched.
import { describe, expect, it } from 'vitest';
import { fullscreen, type FullscreenDoc } from '../../src/preview';

function fakeDoc(enabled: boolean, { reject = false } = {}) {
  const listeners = new Set<() => void>();
  const doc: Omit<FullscreenDoc, 'fullscreenElement'> & {
    fullscreenElement: Element | null;
    fire(): void;
    requested: number;
    exited: number;
  } = {
    fullscreenEnabled: enabled,
    fullscreenElement: null,
    requested: 0,
    exited: 0,
    async exitFullscreen() {
      doc.exited++;
      doc.fullscreenElement = null;
      doc.fire();
    },
    addEventListener: (_type: 'fullscreenchange', fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: 'fullscreenchange', fn: () => void) => listeners.delete(fn),
    fire: () => listeners.forEach((fn) => fn()),
  };
  const element = {
    async requestFullscreen() {
      doc.requested++;
      if (reject) throw new TypeError('Permissions check failed');
      doc.fullscreenElement = element as unknown as Element;
      doc.fire();
    },
  } as unknown as HTMLElement;
  return { doc, element };
}

describe('MOD-Preview full screen (F-002.R7)', () => {
  it('F-002.R7 uses the browser full screen when the page may, and leaves it again', async () => {
    const { doc, element } = fakeDoc(true);
    const fs = fullscreen(element, doc);
    expect(fs.mode.value).toBe('off');
    await expect(fs.enter()).resolves.toBe('fullscreen');
    expect(doc.requested).toBe(1);
    expect(fs.mode.value).toBe('fullscreen');
    await fs.exit();
    expect(doc.exited).toBe(1);
    expect(fs.mode.value).toBe('off');
  });

  it('F-002.R7 when the browser leaves full screen by itself (Esc), the mode follows', async () => {
    const { doc, element } = fakeDoc(true);
    const fs = fullscreen(element, doc);
    await fs.enter();
    doc.fullscreenElement = null;
    doc.fire();
    expect(fs.mode.value).toBe('off');
  });

  it('F-002.R7 without page full screen (iPhone Safari) the preview is maximised within the page', async () => {
    const { doc, element } = fakeDoc(false);
    const fs = fullscreen(element, doc);
    await expect(fs.enter()).resolves.toBe('maximised');
    expect(doc.requested).toBe(0);
    expect(fs.mode.value).toBe('maximised');
    await fs.exit();
    expect(fs.mode.value).toBe('off');
    expect(doc.exited).toBe(0);
  });

  it('F-002.R7 a refused full-screen request (a host frame without permission) falls back to maximised', async () => {
    const { doc, element } = fakeDoc(true, { reject: true });
    const fs = fullscreen(element, doc);
    await expect(fs.enter()).resolves.toBe('maximised');
    expect(fs.mode.value).toBe('maximised');
  });

  it('F-002.R7 toggle enters and leaves; dispose stops listening', async () => {
    const { doc, element } = fakeDoc(true);
    const fs = fullscreen(element, doc);
    await fs.toggle();
    expect(fs.mode.value).toBe('fullscreen');
    await fs.toggle();
    expect(fs.mode.value).toBe('off');
    fs.dispose();
    doc.fullscreenElement = element as unknown as Element;
    doc.fire();
    expect(fs.mode.value).toBe('off');
  });
});
