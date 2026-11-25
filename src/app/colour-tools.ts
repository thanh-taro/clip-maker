// MOD-App — the colour tools in the Adjust panel (F-024 colour mixer, F-025 colour pop, F-026 split toning,
// F-027 duotone; RULE-24, D-053): what CMP-Inspector's colour-tool groups and CMP-ColourPicker show, and the
// actions behind them. The rule maths and normalisation are MOD-Core's (`colour-tools.ts`, `colour.ts`), the
// edits MOD-Project's (`setMixer` … `resetDuotone`); MOD-Compositor draws them in RULE-24 order in the preview
// and the export alike. Each control is one RULE-13 step; one slider movement is one step (F-014
// `beginGesture`), measured from where it began. Which groups are open, which mixer range is shown and
// whether the colour picker is open are session UI state, never undo steps (RULE-24 *History*).
// Implements: F-024.R1/R4/R5, F-025.R1/R4/R5, F-026.R1/R4/R5, F-027.R1/R3/R5, RULE-24 *Reset, copy and
// compare* (per-row Reset, each tool's Reset, the drag detent of bipolar sliders) and *History*,
// CMP-Inspector "clip Adjust · colour tools", CMP-ColourPicker "Behavior".
import { computed, effect, signal } from '@preact/signals';
import {
  RANGE_REFERENCE,
  RULE_08,
  RULE_24,
  COLOUR_RANGES,
  hueWheelRgb,
  mixerValue,
  nearestRange,
  popSettings,
  splitSettings,
  type ColourRangeName,
  type ColourTools,
  type DuotoneChoice,
  type MixerValueName,
  type Project,
  type SplitToning,
  type Vec3,
} from '../core';
import {
  beginGesture,
  chooseDuotone,
  edit,
  project,
  resetDuotone,
  resetMixer,
  resetPop,
  resetSplitToning,
  setDuotone,
  setMixer,
  setPop,
  setSplitToning,
  swapDuotone,
  type EditResult,
} from '../project';
import { selectedClip } from './arrange';
import type { SliderDrag } from './slider-gesture';

/** CMP-Inspector "clip Adjust · colour tools": the groups, in RULE-24 order of use (colour replace from 1.3.0). */
export const TOOLS = ['mixer', 'pop', 'split', 'duotone'] as const;
export type ToolName = (typeof TOOLS)[number];

/** The group title of each tool (COPY-colour_tools.group_*). */
export const TOOL_TITLE = {
  mixer: 'colour_tools.group_mixer',
  pop: 'colour_tools.group_pop',
  split: 'colour_tools.group_split',
  duotone: 'colour_tools.group_duotone',
} as const satisfies Record<ToolName, string>;

// ── session UI state (not undo steps, RULE-24 *History*) ─────────────────────────────────────────

/** The open groups (all start collapsed), kept for the session. */
export const openTools = signal<ReadonlySet<ToolName>>(new Set());

export function toggleTool(tool: ToolName): void {
  const next = new Set(openTools.peek());
  if (next.has(tool)) next.delete(tool);
  else next.add(tool);
  openTools.value = next;
}

/** F-024.AC9: the colour range the mixer shows (Red at first); not stored in the clip. */
export const mixerRange = signal<ColourRangeName>('red');

/** The selected video or photo clip's colour tools, or null (F-024 Edge cases: a photo as a video). */
export const toolsTarget = computed<{ readonly id: string; readonly tools: ColourTools | undefined } | null>(() => {
  const clip = selectedClip.value;
  return clip ? { id: clip.id, tools: clip.colourTools } : null;
});

const toolsOf = (p: Project, id: string): ColourTools | undefined => p.clips.find((c) => c.id === id)?.colourTools;

/** CMP-Inspector: a group is "changed" while any of its values differs from default (duotone: while on). */
export function toolChanged(tools: ColourTools | undefined, tool: ToolName): boolean {
  switch (tool) {
    case 'mixer':
      return tools?.mixer !== undefined;
    case 'pop':
      return tools?.pop !== undefined;
    case 'split':
      return tools?.splitToning !== undefined;
    case 'duotone':
      return tools?.duotone?.on === true;
  }
}

/** F-024.R5: a range with a changed value is marked as changed. */
export const rangeChanged = (tools: ColourTools | undefined, range: ColourRangeName): boolean =>
  tools?.mixer?.[range] !== undefined;

/** RULE-24: each tool's Reset (one step; none when already at default). */
export function resetTool(id: string, tool: ToolName): void {
  edit((p) =>
    tool === 'mixer'
      ? resetMixer(p, id)
      : tool === 'pop'
        ? resetPop(p, id)
        : tool === 'split'
          ? resetSplitToning(p, id)
          : resetDuotone(p, id),
  );
}

// ── sliders ───────────────────────────────────────────────────────────────────────────────────

/** One colour-tool value as a slider row edits it. */
export interface ToolValue {
  /** `data-control` stem, unique within the panel. */
  readonly control: string;
  readonly min: number;
  readonly max: number;
  readonly def: number;
  /** −100 to +100 around 0: the fill runs from the centre, and a pointer drag has RULE-08's detent at 0. */
  readonly bipolar: boolean;
  read(tools: ColourTools | undefined): number;
  write(p: Project, id: string, value: number): EditResult;
}

/** F-024: a range's Hue, Saturation or Lightness (−100 to +100, default 0). */
export const mixerSpec = (range: ColourRangeName, name: MixerValueName): ToolValue => ({
  control: `mixer-${range}-${name}`,
  min: RULE_24.mixerMin,
  max: RULE_24.mixerMax,
  def: 0,
  bipolar: true,
  read: (t) => mixerValue(t, range, name),
  write: (p, id, v) => setMixer(p, id, range, { [name]: v }),
});

/** F-025: Range (default 50) or Amount (default 100), 0 to 100. */
export const popSpec = (name: 'range' | 'amount'): ToolValue => ({
  control: `pop-${name}`,
  min: RULE_24.strengthMin,
  max: RULE_24.strengthMax,
  def: name === 'range' ? RULE_24.popRange : RULE_24.popAmount,
  bipolar: false,
  read: (t) => popSettings(t)[name],
  write: (p, id, v) => setPop(p, id, { [name]: v }),
});

const SPLIT_LIMITS: Readonly<Record<keyof SplitToning, readonly [min: number, max: number, def: number]>> = {
  shadowsHue: [RULE_24.hueMin, RULE_24.hueMax, RULE_24.shadowsHue],
  shadowsStrength: [RULE_24.strengthMin, RULE_24.strengthMax, 0],
  highlightsHue: [RULE_24.hueMin, RULE_24.hueMax, RULE_24.highlightsHue],
  highlightsStrength: [RULE_24.strengthMin, RULE_24.strengthMax, 0],
  balance: [RULE_24.balanceMin, RULE_24.balanceMax, 0],
};

/** F-026: a hue (0–359°), a strength (0–100) or Balance (−100 to +100). */
export const splitSpec = (name: keyof SplitToning): ToolValue => {
  const [min, max, def] = SPLIT_LIMITS[name];
  return {
    control: `split-${name}`,
    min,
    max,
    def,
    bipolar: name === 'balance',
    read: (t) => splitSettings(t)[name],
    write: (p, id, v) => setSplitToning(p, id, { [name]: v }),
  };
};

/** F-027: Strength, 0 to 100, default (and Reset) 100. */
export const duotoneStrengthSpec: ToolValue = {
  control: 'duotone-strength',
  min: RULE_24.strengthMin,
  max: RULE_24.strengthMax,
  def: RULE_24.duotoneStrength,
  bipolar: false,
  read: (t) => t?.duotone?.strength ?? RULE_24.duotoneStrength,
  write: (p, id, v) => setDuotone(p, id, { strength: v }),
};

const clampTo = (spec: ToolValue, v: number): number => Math.min(spec.max, Math.max(spec.min, Math.round(v)));

/** The value in effect on the clip now. */
export const toolValueNow = (id: string, spec: ToolValue): number => spec.read(toolsOf(project.peek(), id));

/** One control (a typed value, a slider key): one step. Returns the value now in effect. */
export function setToolOnce(id: string, spec: ToolValue, value: number): number {
  if (Number.isFinite(value)) edit((p) => spec.write(p, id, clampTo(spec, value)));
  return toolValueNow(id, spec);
}

/** RULE-24 per-row Reset: the value back to its default; one step. */
export function resetToolValue(id: string, spec: ToolValue): void {
  edit((p) => spec.write(p, id, spec.def));
}

/**
 * One slider movement (RULE-13 one step; Q104 a movement back to where it began leaves no step), with
 * RULE-24's drag detent for bipolar sliders (a pointer drag landing within ±2 of 0 lands on 0).
 */
export function beginToolDrag(id: string, spec: ToolValue): SliderDrag {
  const base = project.peek();
  const origin = spec.read(toolsOf(base, id));
  return movement(base, (value) => {
    const r = clampTo(spec, value);
    const v = spec.bipolar && Math.abs(r) <= RULE_08.dragDetent ? 0 : r;
    return v === origin ? null : spec.write(base, id, v);
  });
}

/** A gesture that sets the result of `at(value)` on the project as it was when it began (null: unchanged). */
function movement(base: Project, at: (value: number) => EditResult | null): SliderDrag {
  let ended = false;
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
  });
  return {
    set(value) {
      if (ended || !gesture.active || !Number.isFinite(value)) return;
      gesture.edit((): EditResult => at(value) ?? { project: base, notices: [], changed: [] });
    },
    end() {
      if (ended) return;
      ended = true;
      gesture.end();
    },
    get active() {
      return !ended && gesture.active;
    },
  };
}

// ── choices ──────────────────────────────────────────────────────────────────────────────────

/** F-025.R1: the kept colour (null: None, which keeps Range and Amount); one step. */
export function choosePop(id: string, colour: ColourRangeName | null): void {
  if (popSettings(toolsOf(project.peek(), id)).colour === colour) return;
  edit((p) => setPop(p, id, { colour }));
}

/** F-027.R1: the duotone choice shown (null: None). */
export const duotoneChoice = (tools: ColourTools | undefined): DuotoneChoice | null =>
  tools?.duotone?.on ? tools.duotone.pair : null;

/** F-027.R1/R3: choose a pair, Custom or None; one step (Strength starts at 100). */
export function pickDuotone(id: string, choice: DuotoneChoice | null): void {
  if (duotoneChoice(toolsOf(project.peek(), id)) === choice) return;
  edit((p) => chooseDuotone(p, id, choice));
}

/** F-027.R3: Swap exchanges Custom's two colours; one step. */
export function swapColours(id: string): void {
  edit((p) => swapDuotone(p, id));
}

// ── value text (NFR-06: sliders have values) ───────────────────────────────────────────────────

/** A bipolar value as the slider's value text and the field read it: "+12", "−8", "0". */
export function signed(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `−${-value}`;
}

/** RULE-24 *Hue wheel*: the range a hue names (210° reads Blue). */
export const hueRange = (deg: number): ColourRangeName => nearestRange(deg);

// ── colour picker (CMP-ColourPicker, F-027.R3) ────────────────────────────────────────────────

export type PickerFor = 'shadows' | 'highlights';

/** The open picker (null: closed). Opening or closing it is not an undo step and changes nothing. */
export const pickerOpen = signal<{ readonly clipId: string; readonly which: PickerFor } | null>(null);
/** The colour button focus returns to when the picker closes (CMP-ColourPicker "Behavior"). */
export const pickerReturn = signal<PickerFor | null>(null);

export function openPicker(clipId: string, which: PickerFor): void {
  pickerOpen.value = { clipId, which };
}

export function closePicker(focusButton: boolean): void {
  const open = pickerOpen.peek();
  pickerOpen.value = null;
  if (open && focusButton) pickerReturn.value = open.which;
}

// The picker belongs to Custom on the selected clip: another selection, an undo or a choice that leaves
// Custom closes it.
effect(() => {
  const open = pickerOpen.value;
  if (!open) return;
  const target = toolsTarget.value;
  const d = target?.id === open.clipId ? target.tools?.duotone : undefined;
  if (!d?.on || d.pair !== 'custom') pickerOpen.value = null;
});

/** Custom's colour for one end of the gradient (#RRGGBB). */
export const duotoneHex = (tools: ColourTools | undefined, which: PickerFor): string =>
  tools?.duotone?.[which] ?? '#000000';

/** A preset tap or a confirmed hex entry: one step. */
export function setColourOnce(id: string, which: PickerFor, hex: string): void {
  edit((p) => setDuotone(p, id, { [which]: hex }));
}

/** One picker slider movement: one step, measured from the colour when it began. */
export function beginColourDrag(
  id: string,
  which: PickerFor,
): { set(hex: string): void; end(): void; active: boolean } {
  const base = project.peek();
  const origin = duotoneHex(toolsOf(base, id), which);
  let hex = origin;
  const inner = movement(base, () => (hex === origin ? null : setDuotone(base, id, { [which]: hex })));
  return {
    set(next) {
      hex = next;
      inner.set(0);
    },
    end: () => inner.end(),
    get active() {
      return inner.active;
    },
  };
}

/** CMP-ColourPicker: `#RGB` or `#RRGGBB`, with or without `#`, as upper-case #RRGGBB; null otherwise. */
export function parseHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s))
    return `#${s
      .split('')
      .map((c) => c + c)
      .join('')}`.toUpperCase();
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s}`.toUpperCase() : null;
}

const byte = (x: number): string =>
  Math.round(Math.min(1, Math.max(0, x)) * 255)
    .toString(16)
    .padStart(2, '0');
export const rgbHex = ([r, g, b]: Vec3): string => `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();

export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

/** CMP-ColourPicker: the sRGB colour's hue (0–359), saturation and lightness (0–100), in whole steps. */
export function hexHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round((h + 360) % 360) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** The sRGB colour of a hue (degrees), saturation and lightness (0–100). */
export function hslHex({ h, s, l }: Hsl): string {
  const S = s / 100;
  const L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (k0: number): number => {
    const k = (k0 + h / 30) % 12;
    return L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbHex([f(0), f(8), f(4)]);
}

// ── slider tracks (CMP-Inspector "colour mixer", "split toning"; CMP-ColourPicker) ──────────────
// The tracks show the colours a slider reaches: picture colours from RULE-24's hue wheel and range
// reference colours (rule data, like a look's thumbnail), not design values.

/** The hue wheel (0° to 360°) as a left-to-right gradient. */
export const HUE_WHEEL_TRACK = `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) =>
  rgbHex(hueWheelRgb(i * 30)),
).join(', ')})`;

/** F-024: a range's Hue track, from the previous range's colour through its own to the next one's. */
export function mixerHueTrack(range: ColourRangeName): string {
  const i = COLOUR_RANGES.indexOf(range);
  const at = (k: number): string => RANGE_REFERENCE[COLOUR_RANGES[(k + 8) % 8]!];
  return `linear-gradient(to right, ${at(i - 1)}, ${at(i)}, ${at(i + 1)})`;
}

/** CMP-ColourPicker: the Saturation and Lightness tracks for the colour now. */
export const saturationTrack = ({ h, l }: Hsl): string =>
  `linear-gradient(to right, ${hslHex({ h, s: 0, l })}, ${hslHex({ h, s: 100, l })})`;
export const lightnessTrack = ({ h, s }: Hsl): string =>
  `linear-gradient(to right, #000000, ${hslHex({ h, s, l: 50 })}, #FFFFFF)`;
