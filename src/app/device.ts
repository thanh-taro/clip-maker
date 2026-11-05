// MOD-App — the RULE-22 start-up device check and the session's slow-device notice (F-023).
// The check runs before any media is accepted (MOD-App "runs the capability probe before accepting
// media"), in three parts (platform-mapping "Start-up check", build-spec-questions 59):
//   1. presence: the codec interfaces and a WebGL2 context exist (synchronous; the Gecko Android
//      browser has no codec interfaces at all, architecture.md);
//   2. the MOD-Codec minimal probe on the main thread (decode at 1080p, one encode per video codec,
//      sound encoders), ≤ 300 ms, every call bounded by a timeout. It always runs, so every failure is
//      listed; a failure shows SCR-Unsupported before the editor is ever drawn;
//   3. the engine worker's effects check (MOD-Compositor). Its first answer, "the chain compiled and
//      drew" (≈ 100 ms), decides the opening screen and lets media in (`acceptsMedia`); the timed
//      result (5 + 30 frames at 1080p) comes later and only shows COPY-notice.slow_device. An engine
//      that never answers counts as slow, never as unsupported (RULE-22: slow drawing never blocks).
// Nothing here makes a request (F-023.R4). Everything the device offers is injectable (`DeviceDeps`)
// so tests can play an unsupported device (adapters/tests.md "Device support").
import { computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import type { FromEngine, ToEngine } from '../core';
import { translate, type Language, type MessageId } from '../copy';
import {
  browserCodecApi,
  deviceCheck,
  detectFeatures,
  missingCapabilities,
  probeCapabilities,
  webgl2EffectsCheck,
  type Capabilities,
  type DeviceFeatures,
  type Missing,
} from '../codec';

/** The engine's two answers to one effects check. */
export interface EffectsRun {
  /** The chain compiled and drew its first frame (false: it can't be drawn at all). */
  readonly drawn: Promise<boolean>;
  /** The timed result: below the speed threshold or not. */
  readonly timed: Promise<{ readonly slow: boolean }>;
}

/** How long each engine answer may take before it counts as slow (never as unsupported). */
export interface CheckTimeouts {
  readonly drawnMs: number;
  readonly timedMs: number;
}

export const CHECK_TIMEOUTS: CheckTimeouts = { drawnMs: 3000, timedMs: 10_000 };

/** What the start-up check asks of the device; the browser by default, fakes in tests. */
export interface DeviceDeps {
  /** Which interfaces exist (part 1). */
  features(): DeviceFeatures;
  /** The MOD-Codec minimal probe (part 2). */
  codecs(): Promise<Capabilities>;
  /** The effects check (part 3); only asked when parts 1 and 2 passed. */
  effects(): EffectsRun;
  readonly timeouts?: CheckTimeouts;
}

/** The opening screen and whether media may be added yet. */
export type DeviceStatus =
  | { readonly status: 'checking' }
  /** The editor is shown; the effect chain has not drawn yet, so no media is accepted yet. */
  | { readonly status: 'drawing-check' }
  | { readonly status: 'supported' }
  | { readonly status: 'unsupported'; readonly missing: readonly Missing[] };

export const device = signal<DeviceStatus>({ status: 'checking' });

/**
 * Implements: F-023.R1 — media is accepted only on a device that passed every RULE-22 check. Files
 * picked before then are queued by F-001 until this turns true (or the screen turns unsupported).
 */
export const acceptsMedia: ReadonlySignal<boolean> = computed(() => device.value.status === 'supported');

/** The probe's record, for the export panel's offers (RULE-15, RULE-16, F-023.R3/R5). */
export const capabilities = signal<Capabilities | null>(null);

/** Merges failed checks into the order of the rule (decode, encode, effects). */
function inRuleOrder(...lists: (readonly Missing[])[]): Missing[] {
  const all = new Set(lists.flat());
  return (['decode', 'encode', 'effects'] as const).filter((m) => all.has(m));
}

function set(s: DeviceStatus): DeviceStatus {
  device.value = s;
  return s;
}

/** A promise that settles with `value` after `ms` unless `p` settles first. */
function within<T>(p: Promise<T>, ms: number, value: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => (timer = setTimeout(() => resolve(value), ms)));
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/**
 * Implements: F-023.R1/R4/R5, RULE-22 — parts 1 and 2 of the check. Resolves the opening screen:
 * `unsupported` with every failed check, or `drawing-check` (the editor opens; call `finishCheck`).
 */
export async function openingCheck(deps: DeviceDeps): Promise<DeviceStatus> {
  const presence = missingCapabilities(deps.features());
  const caps = await deps.codecs();
  capabilities.value = caps;
  const missing = inRuleOrder(presence, deviceCheck(caps));
  return set(missing.length ? { status: 'unsupported', missing } : { status: 'drawing-check' });
}

/**
 * Implements: F-023.R1, RULE-22 — part 3. `status` follows the first answer: a chain the device can't
 * draw at all is unsupported (COPY-unsupported.missing_effects); otherwise media is accepted. `timed`
 * settles when the timed result has shown COPY-notice.slow_device or not.
 */
export async function finishCheck(deps: DeviceDeps): Promise<{ status: DeviceStatus; timed: Promise<void> }> {
  const none = Promise.resolve();
  if (device.peek().status !== 'drawing-check') return { status: device.peek(), timed: none };
  const t = deps.timeouts ?? CHECK_TIMEOUTS;
  const run = deps.effects();
  type First = 'drawn' | 'failed' | 'late';
  const drawn = await within<First>(
    run.drawn.then((ok): First => (ok ? 'drawn' : 'failed')),
    t.drawnMs,
    'late',
  );
  if (drawn === 'failed') return { status: set({ status: 'unsupported', missing: ['effects'] }), timed: none };
  if (drawn === 'late') reportSlow();
  const timed = within(run.timed, t.timedMs, { slow: true }).then((r) => {
    if (r.slow) reportSlow();
  });
  return { status: set({ status: 'supported' }), timed };
}

// ── COPY-notice.slow_device: shown once per session (RULE-22) ────────────────────────────────────

/** True while the slow-device notice is on screen. */
export const slowNotice = signal(false);
let slowReported = false;

/**
 * Implements: RULE-22, F-023.AC6/AC7 — slow effects at start-up or a source decoding slower than real
 * time show COPY-notice.slow_device; the notice appears at most once per session.
 */
export function reportSlow(): void {
  if (slowReported) return;
  slowReported = true;
  slowNotice.value = true;
}

export function dismissSlow(): void {
  slowNotice.value = false;
}

/** Follows a slow-device signal (MOD-Preview's `slowDevice`, wired by F-002) into the session notice. */
export function watchSlow(slow: ReadonlySignal<boolean>): () => void {
  return effect(() => {
    if (slow.value) reportSlow();
  });
}

/** Test reset of the session state (one page = one session in the app). */
export function resetDeviceSession(): void {
  slowReported = false;
  slowNotice.value = false;
  capabilities.value = null;
  device.value = { status: 'checking' };
}

// ── The browser's answers ──────────────────────────────────────────────────────────────────────────

interface EnginePort {
  postMessage(m: ToEngine): void;
  addEventListener(type: 'message', fn: (e: MessageEvent<FromEngine>) => void): void;
  addEventListener(type: 'error', fn: () => void): void;
  removeEventListener(type: 'message', fn: (e: MessageEvent<FromEngine>) => void): void;
  removeEventListener(type: 'error', fn: () => void): void;
}

/**
 * The effects check run by the engine worker (platform-mapping "Start-up check"): `engine:effectsDrawn`
 * then `engine:effects`. An engine worker that fails to start cannot draw anything.
 */
export function engineEffects(engine: EnginePort): EffectsRun {
  let drawn: (ok: boolean) => void = () => undefined;
  let timed: (r: { slow: boolean }) => void = () => undefined;
  const run: EffectsRun = {
    drawn: new Promise((r) => (drawn = r)),
    timed: new Promise((r) => (timed = r)),
  };
  const stop = () => {
    engine.removeEventListener('message', onMessage);
    engine.removeEventListener('error', onError);
  };
  const onMessage = (e: MessageEvent<FromEngine>) => {
    const m = e.data;
    if (m?.type === 'engine:effectsDrawn') drawn(m.ok);
    if (m?.type === 'engine:effects') {
      drawn(m.ok);
      timed({ slow: m.ok && m.slow });
      stop();
    }
  };
  const onError = () => {
    drawn(false);
    timed({ slow: false });
    stop();
  };
  engine.addEventListener('message', onMessage);
  engine.addEventListener('error', onError);
  engine.postMessage({ type: 'engine:effectsCheck' });
  return run;
}

/**
 * The browser's device: interface presence, the codec probe on this thread (platform-mapping: the
 * main thread, 32–54 ms) and the engine worker's effects check.
 */
export function browserDevice(engine: () => EnginePort | undefined): DeviceDeps {
  return {
    features: detectFeatures,
    codecs: () => probeCapabilities(browserCodecApi(), webgl2EffectsCheck),
    effects: () => {
      const port = engine();
      return port ? engineEffects(port) : { drawn: Promise.resolve(false), timed: Promise.resolve({ slow: false }) };
    },
  };
}

// ── SCR-Unsupported text ───────────────────────────────────────────────────────────────────────────

const MISSING_COPY = {
  decode: 'unsupported.missing_decode',
  encode: 'unsupported.missing_encode',
  effects: 'unsupported.missing_effects',
} as const satisfies Record<Missing, MessageId>;

/** COPY-unsupported.body split around its `{missing}` list, as SCR-Unsupported lays it out. */
export interface UnsupportedBody {
  /** The whole sentence with the list joined for the language (the accessible reading). */
  readonly text: string;
  /** Text before the list ("Missing:"); may be empty in a language that puts the list first. */
  readonly before: string;
  /** One COPY-unsupported.missing_* item per failed check, in the order of the rule. */
  readonly items: readonly string[];
  /** Text after the list, without the full stop that closed it; may be empty. */
  readonly after: string;
}

/** Implements: F-023.R1, RULE-22 — the explanation of each failed check (SCR-Unsupported). */
export function unsupportedBody(missing: readonly Missing[], lang: Language): UnsupportedBody {
  const items = missing.map((m) => translate(lang, MISSING_COPY[m]));
  const list = new Intl.ListFormat(lang, { type: 'conjunction' }).format(items);
  const MARK = '\u0000';
  const [before = '', after = ''] = translate(lang, 'unsupported.body', { missing: MARK }).split(MARK);
  return {
    text: translate(lang, 'unsupported.body', { missing: list }),
    before: before.trim(),
    items,
    after: after.replace(/^[.\s]+/, '').trim(),
  };
}
