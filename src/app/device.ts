// MOD-App — the RULE-22 start-up device check and the session's slow-device notice (F-023).
// The check runs before any media is accepted (MOD-App "runs the capability probe before accepting
// media"), in three parts:
//   1. presence: the codec interfaces and a WebGL2 context exist (synchronous; the Gecko Android
//      browser has no codec interfaces at all, architecture.md);
//   2. the MOD-Codec minimal probe (decode at 1080p, one encode per video codec, sound encoders),
//      ≤ 300 ms; a failure here shows SCR-Unsupported before the editor is ever drawn;
//   3. the timed effects check in the engine worker (MOD-Compositor, 1080p, 5 + 30 frames). The editor
//      is drawn while it runs, but media is accepted only once it passed (`acceptsMedia`); a chain the
//      device cannot draw at all turns the opening screen into SCR-Unsupported, a slow one gives
//      COPY-notice.slow_device (build-spec-questions 59).
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

/** The RULE-22 effects answer of the engine worker (MOD-Compositor `effectsCheck`). */
export interface EffectsAnswer {
  readonly ok: boolean;
  readonly slow: boolean;
}

/** What the start-up check asks of the device; the browser by default, fakes in tests. */
export interface DeviceDeps {
  /** Which interfaces exist (part 1). */
  features(): DeviceFeatures;
  /** The MOD-Codec minimal probe (part 2). */
  codecs(): Promise<Capabilities>;
  /** The timed effects check (part 3); only asked when parts 1 and 2 passed. */
  effects(): Promise<EffectsAnswer>;
}

/** The opening screen and whether media may be added yet. */
export type DeviceStatus =
  | { readonly status: 'checking' }
  /** The editor is shown; the effects check is still running, so no media is accepted yet. */
  | { readonly status: 'drawing-check' }
  | { readonly status: 'supported' }
  | { readonly status: 'unsupported'; readonly missing: readonly Missing[] };

export const device = signal<DeviceStatus>({ status: 'checking' });

/** Implements: F-023.R1 — media is accepted only on a device that passed every RULE-22 check. */
export const acceptsMedia: ReadonlySignal<boolean> = computed(() => device.value.status === 'supported');

/** The probe's record, for the export panel's offers (RULE-15, RULE-16, F-023.R3/R5). */
export const capabilities = signal<Capabilities | null>(null);

/** Merges failed checks into the order of the rule (decode, encode, effects). */
function inRuleOrder(...lists: (readonly Missing[])[]): Missing[] {
  const all = new Set(lists.flat());
  return (['decode', 'encode', 'effects'] as const).filter((m) => all.has(m));
}

/**
 * Implements: F-023.R1/R4/R5, RULE-22 — parts 1 and 2 of the check. Resolves the opening screen:
 * `unsupported` with every failed check, or `drawing-check` (the editor opens; call `finishCheck`).
 * The codec probe is skipped when the interfaces are missing (nothing to ask).
 */
export async function openingCheck(deps: DeviceDeps): Promise<DeviceStatus> {
  const presence = missingCapabilities(deps.features());
  if (presence.includes('decode') || presence.includes('encode')) {
    return set({ status: 'unsupported', missing: presence });
  }
  const caps = await deps.codecs();
  capabilities.value = caps;
  const missing = inRuleOrder(presence, deviceCheck(caps));
  return set(missing.length ? { status: 'unsupported', missing } : { status: 'drawing-check' });
}

/**
 * Implements: F-023.R1, RULE-22 — part 3. A device that cannot draw the effect chain at all is
 * unsupported (COPY-unsupported.missing_effects); one that draws it below the speed threshold opens
 * anyway with COPY-notice.slow_device. Either way the result is final for the session.
 */
export async function finishCheck(deps: DeviceDeps): Promise<DeviceStatus> {
  if (device.peek().status !== 'drawing-check') return device.peek();
  const r = await deps.effects();
  if (!r.ok) return set({ status: 'unsupported', missing: ['effects'] });
  if (r.slow) reportSlow();
  return set({ status: 'supported' });
}

function set(s: DeviceStatus): DeviceStatus {
  device.value = s;
  return s;
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
 * The effects check run by the engine worker (platform-mapping "Start-up check"; question 30). An
 * engine worker that fails to start cannot draw anything, which counts as "can't draw effects".
 */
export function engineEffects(engine: EnginePort): Promise<EffectsAnswer> {
  return new Promise((resolve) => {
    const done = (r: EffectsAnswer) => {
      engine.removeEventListener('message', onMessage);
      engine.removeEventListener('error', onError);
      resolve(r);
    };
    const onMessage = (e: MessageEvent<FromEngine>) => {
      if (e.data?.type === 'engine:effects') done({ ok: e.data.ok, slow: e.data.ok && e.data.slow });
    };
    const onError = () => done({ ok: false, slow: false });
    engine.addEventListener('message', onMessage);
    engine.addEventListener('error', onError);
    engine.postMessage({ type: 'engine:effectsCheck' });
  });
}

/**
 * The browser's device: interface presence, the codec probe on this thread (a WebGL2 context stands in
 * for "can draw" until the engine's timed check answers) and the engine worker's effects check.
 */
export function browserDevice(engine: () => EnginePort | undefined): DeviceDeps {
  return {
    features: detectFeatures,
    codecs: () => probeCapabilities(browserCodecApi(), webgl2EffectsCheck),
    effects: () => {
      const port = engine();
      return port ? engineEffects(port) : Promise.resolve({ ok: false, slow: false });
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
  /** Text before the list ("Missing:"). */
  readonly before: string;
  /** One COPY-unsupported.missing_* item per failed check, in the order of the rule. */
  readonly items: readonly string[];
  /** Text after the list, without the full stop that closed the list ("Open Clip Maker in …"). */
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
