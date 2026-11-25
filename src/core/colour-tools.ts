// MOD-Core — the colour tools' settings (RULE-24, D-053; `colourTools` in project.schema.json): ranges and
// defaults, normalisation (every value at its default is dropped, so a clip whose tools are all at default
// has no `colourTools` and renders exactly as before, ADR-0017 §6), and the "on" tests the grade uses.
// Colour replace (RULE-25, F-028) is `draft` for 1.3.0: its list is carried unchanged.
// Implements: RULE-24 ranges and defaults, *Duotone* remembered colours.
import { COLOUR_RANGES, type ColourRangeName } from './colour';
import { DUOTONE_PAIR_COLOURS, type DuotonePairId } from './looks.gen';
import type { ColourTools, MixerRange } from './project.gen';

/** Implements: RULE-24 ranges and defaults. */
export const RULE_24 = /* @__PURE__ */ Object.freeze({
  mixerMin: -100,
  mixerMax: 100,
  popRange: 50,
  popAmount: 100,
  shadowsHue: 210,
  highlightsHue: 35,
  hueMin: 0,
  hueMax: 359,
  balanceMin: -100,
  balanceMax: 100,
  strengthMin: 0,
  strengthMax: 100,
  duotoneStrength: 100,
  /** RULE-24: Custom starts from Midnight & Peach's colours when the clip never had a duotone. */
  duotoneStart: 'midnight-peach' as DuotonePairId,
});

export type Mixer = NonNullable<ColourTools['mixer']>;
export type Pop = NonNullable<ColourTools['pop']>;
export type SplitToning = NonNullable<ColourTools['splitToning']>;
export type Duotone = NonNullable<ColourTools['duotone']>;
export type DuotoneChoice = DuotonePairId | 'custom';
export const MIXER_VALUES = ['hue', 'saturation', 'lightness'] as const;
export type MixerValueName = (typeof MIXER_VALUES)[number];

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));
const HEX = /^#[0-9A-F]{6}$/;
/** Upper-case #RRGGBB, or null when it is not a colour (schema `hex`). */
export function normaliseHex(hex: string): string | null {
  const h = hex.trim().toUpperCase();
  return HEX.test(h) ? h : null;
}

function normaliseMixer(m: Mixer | undefined): Mixer | undefined {
  if (!m) return undefined;
  const out: Partial<Record<ColourRangeName, MixerRange>> = {};
  for (const r of COLOUR_RANGES) {
    const v = m[r];
    if (!v) continue;
    const range: Record<string, number> = {};
    for (const k of MIXER_VALUES) {
      const x = v[k];
      if (x === undefined) continue;
      const c = clampInt(x, RULE_24.mixerMin, RULE_24.mixerMax);
      if (c !== 0) range[k] = c;
    }
    if (Object.keys(range).length) out[r] = range as MixerRange;
  }
  return Object.keys(out).length ? (out as Mixer) : undefined;
}

function normalisePop(p: Pop | undefined): Pop | undefined {
  if (!p) return undefined;
  const out: { colour?: ColourRangeName | null; range?: number; amount?: number } = {};
  if (p.colour) out.colour = p.colour;
  const range = clampInt(p.range ?? RULE_24.popRange, RULE_24.strengthMin, RULE_24.strengthMax);
  const amount = clampInt(p.amount ?? RULE_24.popAmount, RULE_24.strengthMin, RULE_24.strengthMax);
  if (range !== RULE_24.popRange) out.range = range;
  if (amount !== RULE_24.popAmount) out.amount = amount;
  return Object.keys(out).length ? out : undefined;
}

function normaliseSplit(s: SplitToning | undefined): SplitToning | undefined {
  if (!s) return undefined;
  const out: Record<string, number> = {};
  const put = (k: keyof SplitToning, v: number | undefined, lo: number, hi: number, def: number): void => {
    if (v === undefined) return;
    const c = clampInt(v, lo, hi);
    if (c !== def) out[k] = c;
  };
  put('shadowsHue', s.shadowsHue, RULE_24.hueMin, RULE_24.hueMax, RULE_24.shadowsHue);
  put('shadowsStrength', s.shadowsStrength, RULE_24.strengthMin, RULE_24.strengthMax, 0);
  put('highlightsHue', s.highlightsHue, RULE_24.hueMin, RULE_24.hueMax, RULE_24.highlightsHue);
  put('highlightsStrength', s.highlightsStrength, RULE_24.strengthMin, RULE_24.strengthMax, 0);
  put('balance', s.balance, RULE_24.balanceMin, RULE_24.balanceMax, 0);
  return Object.keys(out).length ? (out as SplitToning) : undefined;
}

function normaliseDuotone(d: Duotone | null | undefined): Duotone | undefined {
  if (!d) return undefined;
  const builtIn = d.pair !== 'custom' ? DUOTONE_PAIR_COLOURS[d.pair] : undefined;
  return {
    on: d.on,
    pair: d.pair,
    // Schema: for a built-in pair, the colours are that pair's (looks.md).
    shadows: builtIn?.shadows ?? normaliseHex(d.shadows) ?? DUOTONE_PAIR_COLOURS[RULE_24.duotoneStart].shadows,
    highlights:
      builtIn?.highlights ?? normaliseHex(d.highlights) ?? DUOTONE_PAIR_COLOURS[RULE_24.duotoneStart].highlights,
    strength: clampInt(d.strength, RULE_24.strengthMin, RULE_24.strengthMax),
  };
}

/**
 * Implements: RULE-24 ranges (whole steps, clamped) and defaults. Values at their default are dropped and an
 * empty result is `undefined`, so "absent" and "all at default" are the same document (ADR-0017 §6). A
 * duotone object is kept while off (it remembers the colours for Custom); `null` means never set.
 */
export function normaliseColourTools(t: ColourTools | undefined): ColourTools | undefined {
  if (!t) return undefined;
  const out: { -readonly [K in keyof ColourTools]: ColourTools[K] } = {};
  const mixer = normaliseMixer(t.mixer);
  const pop = normalisePop(t.pop);
  const splitToning = normaliseSplit(t.splitToning);
  const duotone = normaliseDuotone(t.duotone);
  if (mixer) out.mixer = mixer;
  if (pop) out.pop = pop;
  if (splitToning) out.splitToning = splitToning;
  if (duotone) out.duotone = duotone;
  if (t.replace?.length) out.replace = t.replace; // RULE-25 (F-028, 1.3.0): carried, not edited here
  return Object.keys(out).length ? out : undefined;
}

/** RULE-24 *Duotone*: the colours a choice starts with (Custom: the colours shown last, else Midnight & Peach). */
export function duotoneStart(
  choice: DuotoneChoice,
  current: Duotone | null | undefined,
): { shadows: string; highlights: string } {
  const pair = DUOTONE_PAIR_COLOURS[choice === 'custom' ? RULE_24.duotoneStart : choice];
  if (choice !== 'custom' || !current) return { shadows: pair.shadows, highlights: pair.highlights };
  return { shadows: current.shadows, highlights: current.highlights };
}

/** RULE-24: a mixer value as shown (absent = 0). */
export const mixerValue = (t: ColourTools | undefined, range: ColourRangeName, name: MixerValueName): number =>
  t?.mixer?.[range]?.[name] ?? 0;

/** RULE-24: colour pop's settings as shown (defaults filled in). */
export const popSettings = (
  t: ColourTools | undefined,
): { readonly colour: ColourRangeName | null; readonly range: number; readonly amount: number } => ({
  colour: t?.pop?.colour ?? null,
  range: t?.pop?.range ?? RULE_24.popRange,
  amount: t?.pop?.amount ?? RULE_24.popAmount,
});

/** RULE-24: split toning's settings as shown (defaults filled in). */
export const splitSettings = (t: ColourTools | undefined): Required<SplitToning> => ({
  shadowsHue: t?.splitToning?.shadowsHue ?? RULE_24.shadowsHue,
  shadowsStrength: t?.splitToning?.shadowsStrength ?? 0,
  highlightsHue: t?.splitToning?.highlightsHue ?? RULE_24.highlightsHue,
  highlightsStrength: t?.splitToning?.highlightsStrength ?? 0,
  balance: t?.splitToning?.balance ?? 0,
});
