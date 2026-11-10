// MOD-App — CMP-Preview (specs/30-experience/components/CMP-Preview.md; boards CMP-Preview,
// SCR-Editor default/playing/empty): the stage with the frame (MOD-Preview's canvas, an image named
// COPY-preview.label), CMP-EmptyState in its place while the project is empty, the notice stack, the
// full-screen chrome bar, and the transport (Go to start, Previous frame, Play/Pause, Next frame, Go to
// end, the time, Full screen). The time and the label are bound to signals, so playback never
// re-renders the tree (ADR-0002 §1); only Play/Pause re-renders when the play state changes.
// Implements: F-002.R1 (the frame), F-002.R2 (Play/Pause), F-002.R4 (step, start, end), F-002.R5 (the
// time, COPY-time.position with the frame suffix, D-039), F-002.R7 (full screen / maximised), RULE-20
// playback keys (bound while the editor is mounted), RULE-21 (frame step and play stand in for scrub).
import { computed, effect, signal } from '@preact/signals';
import type { Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, formatTimecode, t } from '../copy';
import { isEmpty, project } from '../project';
import { EmptyState } from './EmptyState';
import { Icon, type IconName } from './icons';
import { Notices } from './NoticeStack';
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

  // The preview mounts once the engine and audio workers answer; SCR-Unsupported stops them (unmount).
  useEffect(() => {
    const frame = frameRef.current;
    const stage = stageRef.current;
    if (!ready || !frame || !stage) return undefined;
    return mountPlayback(frame, stage);
  }, [ready]);

  useEffect(() => bindPlaybackKeys(), []);

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

  // Focus follows full screen: into the chrome bar on entering, back to Full screen on leaving.
  const previous = useRef(mode);
  useEffect(() => {
    if (mode !== 'off' && previous.current === 'off') exitRef.current?.focus();
    if (mode === 'off' && previous.current !== 'off') fullRef.current?.focus();
    previous.current = mode;
  }, [mode]);

  return (
    <main class="tk-preview-area" tabIndex={-1} data-fullscreen={mode === 'off' ? undefined : mode}>
      <div class="tk-stage" ref={stageRef}>
        <div class="tk-frame" ref={frameRef} role="img" aria-label={frameLabel} data-empty={empty ? '' : undefined} />
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
