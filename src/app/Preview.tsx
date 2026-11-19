// MOD-App — CMP-Preview (specs/30-experience/components/CMP-Preview.md; boards CMP-Preview,
// SCR-Editor default/playing/empty): the stage with the frame (MOD-Preview's canvas, an image named
// COPY-preview.label), CMP-EmptyState in its place while the project is empty, the notice stack, the
// full-screen chrome bar, and the transport (Go to start, Previous frame, Play/Pause, Next frame, Go to
// end, the time, Full screen). The time and the label are bound to signals, so playback never
// re-renders the tree (ADR-0002 §1); only Play/Pause re-renders when the play state changes.
// Implements: F-002.R1 (the frame), F-002.R2 (Play/Pause), F-002.R4 (step, start, end), F-002.R5 (the
// time, COPY-time.position with the frame suffix, D-039), F-002.R7 (full screen / maximised), RULE-20
// playback keys (bound while the editor is mounted), RULE-21 (frame step and play stand in for scrub).
// F-006: the selected clip's placement outline and handles over the frame (./PlacementOverlay.tsx).
// F-007: while compare is held, the frame shows the clip without adjustments and look (MOD-Preview
// `setCompare`) and the pill COPY-preview.comparing sits in the top-left corner (CMP-Preview "holding
// compare"); the F-007 keys (Mod+C, Mod+V, hold \) are bound while the editor is mounted. Implements:
// F-007.R7, F-007.AC9, RULE-08 *Compare*, RULE-20. F-008: a look previewed in the gallery is drawn on the
// selected clip (MOD-Preview `setLookPreview`; F-008.R2, RULE-09). F-010: the text layers' hit areas, the
// selected text's outline, handles and move guides (./TextOverlay.tsx), and CMP-TextEditor over the frame while
// a text layer is edited (./TextEditor.tsx).
import { computed, effect, signal } from '@preact/signals';
import type { Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, formatTimecode, t } from '../copy';
import { isEmpty, project } from '../project';
import { bindAdjustKeys, comparing } from './adjust';
import { EmptyState } from './EmptyState';
import { previewing } from './looks';
import { Icon, type IconName } from './icons';
import { Notices } from './NoticeStack';
import { PlacementOverlay } from './PlacementOverlay';
import { TextEditor } from './TextEditor';
import { TextOverlay } from './TextOverlay';
import { bindPlaybackKeys, mountPlayback, playback } from './playback';
import { workersReady } from './workers';

const MARK = '\u0001';
const timeUs = computed(() => playback.value?.ctl.time.value ?? 0);
const durationUs = computed(() => playback.value?.ctl.duration.value ?? 0);
const code = computed(() => formatTimecode(timeUs.value, project.value.frame.frameRate));
const nowText = computed(() => code.value.time);
const frameText = computed(() => code.value.frame);
/** COPY-time.position around the current time, so the current time can carry its own styling. */
const position = computed(() =>
  t('time.position', { current: MARK, length: formatDuration(durationUs.value) }).split(MARK),
);
const beforeNow = computed(() => position.value[0] ?? '');
const afterNow = computed(() => position.value[1] ?? '');
const frameLabel = computed(() => t('preview.label', { time: formatDuration(timeUs.value) }));
const fsMode = computed(() => playback.value?.fs.mode.value ?? 'off');
/** CMP-Preview accessibility: the time is announced politely only when playback stops. */
const announced = signal('');

function TransportButton({
  icon,
  label,
  action,
  disabled,
  onClick,
  round = false,
  buttonRef,
}: {
  icon: IconName;
  label: string;
  action: string;
  disabled: boolean;
  onClick: () => void;
  round?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      class={round ? 'tk-transport__button tk-transport__button--play' : 'tk-transport__button'}
      data-action={action}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      ref={buttonRef ?? null}
    >
      <Icon name={icon} size={round ? 18 : 16} />
    </button>
  );
}

/** The time: current m:ss, the muted frame suffix (wide transport only), then the muted length. */
function Time({ frame }: { frame: boolean }) {
  return (
    <span class="tk-time">
      {beforeNow}
      <span class="tk-time__now">{nowText}</span>
      {frame ? <span class="tk-time__frame">{frameText}</span> : null}
      {afterNow}
    </span>
  );
}

const ctl = () => playback.peek()?.ctl;

function Transport({ fullRef }: { fullRef: Ref<HTMLButtonElement> }) {
  const playable = durationUs.value > 0;
  const playing = playback.value?.ctl.state.value === 'playing';
  const off = !playable;
  return (
    <div class="tk-transport" data-playing={playing ? '' : undefined}>
      <TransportButton
        icon="goStart"
        label={t('action.go_start')}
        action="go-start"
        disabled={off}
        onClick={() => ctl()?.toStart()}
      />
      <TransportButton
        icon="prevFrame"
        label={t('action.prev_frame')}
        action="prev-frame"
        disabled={off}
        onClick={() => ctl()?.step(-1)}
      />
      <TransportButton
        icon={playing ? 'pause' : 'play'}
        label={playing ? t('action.pause') : t('action.play')}
        action="play-pause"
        disabled={off}
        round
        onClick={() => ctl()?.toggle()}
      />
      <TransportButton
        icon="nextFrame"
        label={t('action.next_frame')}
        action="next-frame"
        disabled={off}
        onClick={() => ctl()?.step(1)}
      />
      <TransportButton
        icon="goEnd"
        label={t('action.go_end')}
        action="go-end"
        disabled={off}
        onClick={() => ctl()?.toEnd()}
      />
      <Time frame />
      <TransportButton
        icon="fullScreen"
        label={t('action.full_screen')}
        action="full-screen"
        disabled={off}
        onClick={() => void playback.peek()?.fs.enter()}
        buttonRef={fullRef}
      />
    </div>
  );
}

/** CMP-Preview "full screen (maximised)": Pause/Play, the time and Exit full screen on the chrome bar. */
function FullscreenBar({ exitRef }: { exitRef: Ref<HTMLButtonElement> }) {
  const playing = playback.value?.ctl.state.value === 'playing';
  return (
    <div class="tk-fullscreen-bar">
      <TransportButton
        icon={playing ? 'pause' : 'play'}
        label={playing ? t('action.pause') : t('action.play')}
        action="play-pause"
        disabled={false}
        onClick={() => ctl()?.toggle()}
      />
      <Time frame={false} />
      <TransportButton
        icon="exitFullScreen"
        label={t('action.exit_full_screen')}
        action="exit-full-screen"
        disabled={false}
        onClick={() => void playback.peek()?.fs.exit()}
        buttonRef={exitRef}
      />
    </div>
  );
}

export function PreviewArea({ addRef }: { addRef: (el: HTMLButtonElement | null) => void }) {
  const empty = isEmpty.value;
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLButtonElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const ready = workersReady.value.includes('engine') && workersReady.value.includes('audio');
  const mode = fsMode.value;
  const holding = comparing.value !== null;

  // The preview mounts once the engine and audio workers answer; SCR-Unsupported stops them (unmount).
  useEffect(() => {
    const frame = frameRef.current;
    const stage = stageRef.current;
    if (!ready || !frame || !stage) return undefined;
    return mountPlayback(frame, stage);
  }, [ready]);

  useEffect(() => bindPlaybackKeys(), []);
  // F-007: Mod+C / Mod+V / hold \ (RULE-20), and the compare hold sent to MOD-Preview (RULE-08).
  useEffect(() => bindAdjustKeys(), []);
  useEffect(() => effect(() => playback.value?.ctl.setCompare(comparing.value)), []);
  // F-008.R2: a look previewed on the selected clip (hover or focus in the gallery), never an undo step.
  useEffect(
    () =>
      effect(() => {
        const p = previewing.value;
        playback.value?.ctl.setLookPreview(p?.clipId ?? null, p?.look ?? null);
      }),
    [],
  );

  // Announce the time when playback stops (CMP-Preview accessibility).
  useEffect(() => {
    let was = false;
    return effect(() => {
      const playing = playback.value?.ctl.state.value === 'playing';
      if (was && !playing) {
        announced.value = t('time.position', {
          current: formatDuration(timeUs.peek()),
          length: formatDuration(durationUs.peek()),
        });
      }
      was = playing;
    });
  }, []);

  const mainRef = useRef<HTMLElement>(null);
  // (Before the focus effect: leaving must lift `inert` before focus returns.)
  // While full screen or maximised, everything outside the stage is inert, so Tab stays on the frame's
  // chrome bar (and the stage's notices) and never reaches hidden controls; Tab wraps within the stage.
  useEffect(() => {
    const stage = stageRef.current;
    const main = mainRef.current;
    const editor = main?.parentElement;
    if (mode === 'off' || !stage || !main || !editor) return undefined;
    // Dialogs are left alone: a modal dialog makes the page behind it inert itself, and one opened just before
    // this effect runs (? pressed right after entering full screen, CMP-ShortcutHelp) would otherwise be made
    // inert with its focused control, dropping focus to the page (F-017.R3).
    const outside = [
      ...Array.from(editor.children).filter((el) => el !== main && !(el instanceof HTMLDialogElement)),
      ...Array.from(main.children).filter((el) => el !== stage),
    ] as HTMLElement[];
    const was = outside.map((el) => el.inert);
    for (const el of outside) el.inert = true;
    // Tab wraps inside the stage instead of leaving the page for the browser's own controls.
    const onTab = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      // A modal dialog over the stage (CMP-ShortcutHelp from ?, F-017) keeps its own Tab order.
      if (document.querySelector('dialog[open]')) return;
      const items = Array.from(stage.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]'));
      if (!items.length) return;
      // Moved here for every engine alike (WebKit's Tab skips buttons by default).
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const n = items.length;
      const next = at < 0 ? (e.shiftKey ? n - 1 : 0) : (at + (e.shiftKey ? n - 1 : 1)) % n;
      items[next]?.focus();
    };
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      outside.forEach((el, i) => (el.inert = was[i] ?? false));
    };
  }, [mode]);

  // Focus follows full screen: into the chrome bar on entering, back to Full screen on leaving (or to the
  // preview region when Full screen is unavailable by then).
  const previous = useRef(mode);
  useEffect(() => {
    if (mode !== 'off' && previous.current === 'off') exitRef.current?.focus();
    if (mode === 'off' && previous.current !== 'off') {
      const full = fullRef.current;
      if (full && !full.disabled) full.focus();
      else mainRef.current?.focus();
    }
    previous.current = mode;
  }, [mode]);

  return (
    <main ref={mainRef} class="tk-preview-area" tabIndex={-1} data-fullscreen={mode === 'off' ? undefined : mode}>
      <div class="tk-stage" ref={stageRef}>
        <div class="tk-frame" ref={frameRef} role="img" aria-label={frameLabel} data-empty={empty ? '' : undefined} />
        {empty ? null : <PlacementOverlay stage={stageRef} />}
        {empty ? null : <TextOverlay stage={stageRef} />}
        {empty ? null : <TextEditor stage={stageRef} />}
        {/* CMP-Preview "holding compare": a quiet pill, a status message (CMP-Preview "Accessibility"). */}
        <p class="tk-preview-pill" role="status" data-shown={holding ? '' : undefined}>
          {holding ? (
            <>
              <Icon name="compare" size={14} />
              {t('preview.comparing')}
            </>
          ) : null}
        </p>
        {empty ? <EmptyState addRef={addRef} /> : null}
        {mode !== 'off' ? <FullscreenBar exitRef={exitRef} /> : null}
        <Notices />
      </div>
      <Transport fullRef={fullRef} />
      <p class="tk-preview-status" role="status">
        {announced}
      </p>
    </main>
  );
}
