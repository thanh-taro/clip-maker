// MOD-App — the auto-hide timer of an info notice (CMP-Notice "Behavior": info and warning hide after a
// few seconds; hovering or focusing them pauses the timer, WCAG 2.2.1). Hover and focus are tracked
// apart, so the pointer leaving while focus stays inside keeps it held. Leaving restarts the full time.
// Implements: F-023 (COPY-notice.slow_device), build-spec-questions 61.

/** "A few seconds" for info notices (question 61). */
export const INFO_HIDE_MS = 8000;

export class HideTimer {
  private hovered = false;
  private focused = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ms: number,
    private readonly onHide: () => void,
  ) {}

  /** The notice is shown: count down unless it is held. */
  start(): void {
    this.running = true;
    this.arm();
  }

  /** The notice is gone. */
  stop(): void {
    this.running = false;
    this.clear();
  }

  hover(on: boolean): void {
    this.hovered = on;
    this.arm();
  }

  focus(on: boolean): void {
    this.focused = on;
    this.arm();
  }

  private arm(): void {
    this.clear();
    if (!this.running || this.hovered || this.focused) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.running = false;
      this.onHide();
    }, this.ms);
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
