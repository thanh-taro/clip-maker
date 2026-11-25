// MOD-App — the colour-tool groups of CMP-Inspector's Adjust tab and the phone Adjust sheet (CMP-Inspector
// "clip Adjust · colour tools", "colour mixer", "colour pop", "split toning", "duotone", "narrow / Adjust
// sheet"; F-024…F-027 UX notes). After Effects, one collapsible group per tool in RULE-24 order of use; each
// header row holds a disclosure button (title, an accent dot and COPY-colour_tools.changed while changed) and,
// after it, the group Reset (COPY-action.reset, named COPY-colour_tools.reset_tool) shown only when changed.
// Groups start collapsed; which are open is kept for the session (./colour-tools.ts `openTools`).
// Implements: F-024.R1/R4/R5, F-025.R1/R4/R5, F-026.R1/R4/R5, F-027.R1/R3/R5, CMP-Inspector "Accessibility"
// (disclosure buttons with an expanded state and COPY-colour_tools.changed in their name; colour range,
// colour pop and duotone choices are radio groups with names, never colour alone; hue sliders read
// COPY-colour_tools.hue_value), RULE-20 (radio groups get the arrow keys).
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t, type MessageId } from '../copy';
import {
  COLOUR_RANGES,
  DUOTONE_PAIR_COLOURS,
  DUOTONE_PAIRS,
  RANGE_REFERENCE,
  MIXER_VALUES,
  type ColourRangeName,
  type ColourTools,
  type DuotoneChoice,
} from '../core';
import { ColourPicker } from './ColourPicker';
import {
  HUE_WHEEL_TRACK,
  TOOL_TITLE,
  beginToolDrag,
  choosePop,
  duotoneChoice,
  duotoneHex,
  duotoneStrengthSpec,
  hueRange,
  mixerHueTrack,
  mixerRange,
  mixerSpec,
  openPicker,
  openTools,
  pickDuotone,
  pickerOpen,
  pickerReturn,
  popSpec,
  rangeChanged,
  resetTool,
  resetToolValue,
  setToolOnce,
  signed,
  splitSpec,
  swapColours,
  toggleTool,
  toolChanged,
  toolValueNow,
  type PickerFor,
  type ToolName,
  type ToolValue,
} from './colour-tools';
import { Icon } from './icons';
import { ToolSlider } from './ToolSlider';

/** A slider row bound to one colour-tool value of the clip. */
function ToolRow({
  id,
  clipId,
  tools,
  spec,
  label,
  name,
  valueText,
  disabled,
  track,
}: {
  readonly id: string;
  readonly clipId: string;
  readonly tools: ColourTools | undefined;
  readonly spec: ToolValue;
  readonly label: string;
  readonly name?: string;
  readonly valueText?: (v: number) => string;
  readonly disabled?: boolean;
  readonly track?: string;
}) {
  const value = spec.read(tools);
  return (
    <ToolSlider
      id={`${id}-${spec.control}`}
      control={spec.control}
      label={label}
      name={name}
      value={value}
      min={spec.min}
      max={spec.max}
      bipolar={spec.bipolar}
      valueText={valueText ?? (spec.bipolar ? signed : String)}
      changed={value !== spec.def}
      disabled={disabled}
      track={track}
      gestureKey={`${clipId}:${spec.control}`}
      begin={() => beginToolDrag(clipId, spec)}
      step={(v) => setToolOnce(clipId, spec, v)}
      shown={() => toolValueNow(clipId, spec)}
      commit={(v) => setToolOnce(clipId, spec, v)}
      reset={() => resetToolValue(clipId, spec)}
    />
  );
}

interface RadioItem<T> {
  readonly value: T;
  /** `data-value`. */
  readonly key: string;
  /** The accessible name (never colour alone). */
  readonly name: string;
  readonly content: ComponentChildren;
  readonly changed?: boolean;
  /** A text chip (None, Custom) among swatches: its own row or cell. */
  readonly chip?: boolean;
}

/**
 * A radio group (ARIA pattern): the chosen radio is in the tab order; the arrow keys move the choice and
 * focus along the group, wrapping; Home and End go to the ends.
 */
function RadioSet<T>({
  labelledBy,
  describedBy,
  items,
  value,
  onChoose,
  variant,
}: {
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly items: readonly RadioItem<T>[];
  readonly value: T;
  readonly onChoose: (value: T) => void;
  readonly variant: 'ranges' | 'pairs';
}) {
  const group = useRef<HTMLDivElement>(null);
  const chosen = items.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent, i: number): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const n = items.length;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i + n - 1) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    const item = items[next]!;
    if (item.value !== value) onChoose(item.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div
      ref={group}
      class={`tk-ctool__radios tk-ctool__radios--${variant}`}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      {items.map((o, i) => {
        const on = i === chosen;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on ? 'true' : 'false'}
            tabIndex={on || (chosen < 0 && i === 0) ? 0 : -1}
            class={o.chip ? 'tk-ctool__radio tk-ctool__radio--chip' : 'tk-ctool__radio'}
            data-value={o.key}
            data-changed={o.changed ? '' : undefined}
            aria-label={o.name}
            title={o.chip ? undefined : o.name}
            onClick={() => onChoose(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.content}
          </button>
        );
      })}
    </div>
  );
}

/** A range's swatch (its RULE-24 reference colour, rule data), with the accent mark when changed. */
const rangeSwatch = (r: ColourRangeName, changed = false) => (
  <>
    <span class="tk-ctool__swatch" aria-hidden="true" style={{ '--ctool-swatch': RANGE_REFERENCE[r] }} />
    {changed ? <span class="tk-ctool__mark" aria-hidden="true" /> : null}
  </>
);

/** A choice's label with the chosen option's name next to it (colour is never the only cue). */
function ChoiceLabel({ id, label, chosen }: { readonly id: string; readonly label: string; readonly chosen: string }) {
  return (
    <div class="tk-ctool__choice-label">
      <span class="tk-field__label" id={id}>
        {label}
      </span>
      <span class="tk-ctool__chosen" aria-hidden="true">
        {chosen}
      </span>
    </div>
  );
}

// ── F-024 colour mixer ─────────────────────────────────────────────────────────────────────────

function MixerBody({ id, clipId, tools }: { id: string; clipId: string; tools: ColourTools | undefined }) {
  const range = mixerRange.value;
  const labelId = `${id}-range`;
  const rangeName = (r: ColourRangeName): string => t(`range.${r}`);
  return (
    <>
      <div class="tk-field">
        <ChoiceLabel id={labelId} label={t('mixer.range')} chosen={rangeName(range)} />
        <RadioSet
          labelledBy={labelId}
          variant="ranges"
          value={range}
          // F-024.AC9: choosing the range shown is UI state, not an undo step.
          onChoose={(r) => (mixerRange.value = r)}
          items={COLOUR_RANGES.map((r) => {
            const changed = rangeChanged(tools, r);
            return {
              value: r,
              key: r,
              name: changed ? t('mixer.range_changed', { range: rangeName(r) }) : rangeName(r),
              content: rangeSwatch(r, changed),
              changed,
            };
          })}
        />
      </div>
      {MIXER_VALUES.map((name) => (
        <ToolRow
          key={`${range}-${name}`}
          id={id}
          clipId={clipId}
          tools={tools}
          spec={mixerSpec(range, name)}
          label={t(`mixer.${name}`)}
          name={t('mixer.slider_name', { range: rangeName(range), control: t(`mixer.${name}`) })}
          {...(name === 'hue' ? { track: mixerHueTrack(range) } : {})}
        />
      ))}
    </>
  );
}

// ── F-025 colour pop ───────────────────────────────────────────────────────────────────────────

function PopBody({ id, clipId, tools }: { id: string; clipId: string; tools: ColourTools | undefined }) {
  const colour = tools?.pop?.colour ?? null;
  const labelId = `${id}-colour`;
  const helpId = `${id}-help`;
  const none = colour === null;
  return (
    <>
      <div class="tk-field">
        <ChoiceLabel id={labelId} label={t('pop.colour')} chosen={none ? t('pop.none') : t(`range.${colour}`)} />
        <RadioSet<ColourRangeName | null>
          labelledBy={labelId}
          describedBy={helpId}
          variant="ranges"
          value={colour}
          onChoose={(c) => choosePop(clipId, c)}
          items={[
            { value: null, key: 'none', name: t('pop.none'), content: t('pop.none'), chip: true },
            ...COLOUR_RANGES.map((r) => ({ value: r, key: r, name: t(`range.${r}`), content: rangeSwatch(r) })),
          ]}
        />
        <p class="tk-ctool__help" id={helpId}>
          {t('pop.help')}
        </p>
      </div>
      <ToolRow id={id} clipId={clipId} tools={tools} spec={popSpec('range')} label={t('pop.range')} disabled={none} />
      <ToolRow id={id} clipId={clipId} tools={tools} spec={popSpec('amount')} label={t('pop.amount')} disabled={none} />
    </>
  );
}

// ── F-026 split toning ─────────────────────────────────────────────────────────────────────────

/** F-026.R5: a hue slider reads its degrees and the nearest range ("210°, Blue"). */
const hueText = (v: number): string => t('colour_tools.hue_value', { degrees: v, range: t(`range.${hueRange(v)}`) });

/** F-026: Balance reads which side it favours ("30 toward shadows", "Even"). */
const balanceText = (v: number): string =>
  v < 0
    ? t('split.balance_shadows', { value: -v })
    : v > 0
      ? t('split.balance_highlights', { value: v })
      : t('split.balance_even');

function SplitBody({
  id,
  clipId,
  tools,
  Sub,
}: {
  id: string;
  clipId: string;
  tools: ColourTools | undefined;
  Sub: 'h4' | 'h5';
}) {
  const side = (which: 'shadows' | 'highlights') => (
    <div class="tk-ctool__sub" role="group" aria-labelledby={`${id}-${which}`}>
      <Sub class="tk-ctool__sub-title" id={`${id}-${which}`}>
        {t(`split.${which}`)}
      </Sub>
      <ToolRow
        id={id}
        clipId={clipId}
        tools={tools}
        spec={splitSpec(`${which}Hue`)}
        label={t('split.hue')}
        name={t(`split.${which}_hue`)}
        valueText={hueText}
        track={HUE_WHEEL_TRACK}
      />
      <ToolRow
        id={id}
        clipId={clipId}
        tools={tools}
        spec={splitSpec(`${which}Strength`)}
        label={t('split.strength')}
        name={t(`split.${which}_strength`)}
      />
    </div>
  );
  return (
    <>
      {side('shadows')}
      {side('highlights')}
      <ToolRow
        id={id}
        clipId={clipId}
        tools={tools}
        spec={splitSpec('balance')}
        label={t('split.balance')}
        valueText={balanceText}
      />
    </>
  );
}

// ── F-027 duotone ──────────────────────────────────────────────────────────────────────────────

/** CMP-ColourPicker's colour button: swatch, label and hex; named by its label and reading its value. */
function ColourButton({ clipId, which, hex, open }: { clipId: string; which: PickerFor; hex: string; open: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const back = pickerReturn.value === which;
  useEffect(() => {
    if (!back) return;
    pickerReturn.value = null;
    ref.current?.focus();
  }, [back]);
  const label = t(`duotone.${which}`);
  return (
    <button
      ref={ref}
      type="button"
      class="tk-colour-button"
      aria-label={t('picker.current', { name: label, hex })}
      aria-haspopup="dialog"
      aria-expanded={open ? 'true' : 'false'}
      data-action={`colour-${which}`}
      onClick={() => (open ? undefined : openPicker(clipId, which))}
    >
      <span class="tk-colour-button__swatch" aria-hidden="true" style={{ '--ctool-swatch': hex }} />
      <span class="tk-colour-button__label">{label}</span>
      <span class="tk-colour-button__hex">{hex}</span>
    </button>
  );
}

function DuotoneBody({
  id,
  clipId,
  tools,
  touch,
}: {
  id: string;
  clipId: string;
  tools: ColourTools | undefined;
  touch: boolean;
}) {
  const choice = duotoneChoice(tools);
  const labelId = `${id}-pairs`;
  const picker = pickerOpen.value;
  const pairName = (c: DuotoneChoice | null): string =>
    c === null
      ? t('duotone.none')
      : c === 'custom'
        ? t('duotone.custom')
        : t(DUOTONE_PAIR_COLOURS[c].copyId as Extract<MessageId, `duotone.pair_${string}`>);
  const items: RadioItem<DuotoneChoice | null>[] = [
    { value: null, key: 'none', name: pairName(null), content: pairName(null), chip: true },
    ...DUOTONE_PAIRS.map((p) => ({
      value: p,
      key: p,
      name: pairName(p),
      content: (
        <>
          <span
            class="tk-ctool__pair"
            aria-hidden="true"
            style={{ '--ctool-a': DUOTONE_PAIR_COLOURS[p].shadows, '--ctool-b': DUOTONE_PAIR_COLOURS[p].highlights }}
          />
          <span class="tk-ctool__pair-name">{pairName(p)}</span>
        </>
      ),
    })),
    { value: 'custom', key: 'custom', name: pairName('custom'), content: pairName('custom'), chip: true },
  ];
  const colour = (which: PickerFor) => {
    const open = picker?.clipId === clipId && picker.which === which;
    return (
      <div class="tk-ctool__colour">
        <ColourButton clipId={clipId} which={which} hex={duotoneHex(tools, which)} open={open} />
        {/* Wide: a popover anchored under its button. Narrow: it opens in place of the sheet's body. */}
        {open && !touch ? <ColourPicker clipId={clipId} which={which} touch={false} /> : null}
      </div>
    );
  };
  return (
    <>
      <div class="tk-field">
        <ChoiceLabel id={labelId} label={t('duotone.pairs')} chosen={pairName(choice)} />
        <RadioSet<DuotoneChoice | null>
          labelledBy={labelId}
          variant="pairs"
          value={choice}
          onChoose={(c) => pickDuotone(clipId, c)}
          items={items}
        />
      </div>
      {choice === 'custom' ? (
        <div class="tk-ctool__colours">
          {colour('shadows')}
          <button
            type="button"
            class="tk-button tk-button--ghost tk-ctool__swap"
            data-action="swap-colours"
            onClick={() => swapColours(clipId)}
          >
            <Icon name="swap" size={16} />
            {t('duotone.swap')}
          </button>
          {colour('highlights')}
        </div>
      ) : null}
      <ToolRow
        id={id}
        clipId={clipId}
        tools={tools}
        spec={duotoneStrengthSpec}
        label={t('duotone.strength')}
        disabled={choice === null}
      />
    </>
  );
}

// ── the groups ─────────────────────────────────────────────────────────────────────────────────

function ToolGroup({
  id,
  tool,
  clipId,
  tools,
  Head,
  children,
}: {
  id: string;
  tool: ToolName;
  clipId: string;
  tools: ColourTools | undefined;
  Head: 'h3' | 'h4';
  children: ComponentChildren;
}) {
  const open = openTools.value.has(tool);
  const changed = toolChanged(tools, tool);
  const title = t(TOOL_TITLE[tool]);
  const bodyId = `${id}-body`;
  const disclosure = useRef<HTMLButtonElement>(null);
  return (
    <div class="tk-ctool" data-tool={tool} data-open={open ? '' : undefined} data-changed={changed ? '' : undefined}>
      <div class="tk-ctool__head">
        <Head class="tk-ctool__heading">
          <button
            ref={disclosure}
            type="button"
            class="tk-ctool__toggle"
            aria-expanded={open ? 'true' : 'false'}
            aria-controls={bodyId}
            data-action={`toggle-${tool}`}
            onClick={() => toggleTool(tool)}
          >
            <Icon name="disclosure" size={16} class="tk-ctool__chevron" />
            <span class="tk-ctool__title">{title}</span>
            {changed ? (
              <>
                <span class="tk-ctool__dot" aria-hidden="true" />
                <span class="tk-ctool__state">{t('colour_tools.changed')}</span>
              </>
            ) : null}
          </button>
        </Head>
        {changed ? (
          <button
            type="button"
            class="tk-adjust__reset-all tk-ctool__reset"
            aria-label={t('colour_tools.reset_tool', { tool: title })}
            data-action={`reset-${tool}`}
            onClick={() => {
              // The Reset goes away with the change: focus moves to the group's header first.
              disclosure.current?.focus();
              resetTool(clipId, tool);
            }}
          >
            <Icon name="reset" size={12} />
            {t('action.reset')}
          </button>
        ) : null}
      </div>
      {open ? (
        <div class="tk-ctool__body" id={bodyId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The four colour-tool groups, after Effects. `Head` is the level of the Adjust groups' titles (h4 in the
 * inspector, h3 in the phone sheet); `touch`: the sheet's touch-size rows.
 */
export function ColourToolGroups({
  id,
  clipId,
  tools,
  touch,
}: {
  readonly id: string;
  readonly clipId: string;
  readonly tools: ColourTools | undefined;
  readonly touch: boolean;
}) {
  const Head: 'h3' | 'h4' = touch ? 'h3' : 'h4';
  const Sub: 'h4' | 'h5' = touch ? 'h4' : 'h5';
  const props = (tool: ToolName) => ({ id: `${id}-${tool}`, tool, clipId, tools, Head });
  return (
    <div class="tk-ctools" data-section="colour-tools">
      <ToolGroup {...props('mixer')}>
        <MixerBody id={`${id}-mixer`} clipId={clipId} tools={tools} />
      </ToolGroup>
      <ToolGroup {...props('pop')}>
        <PopBody id={`${id}-pop`} clipId={clipId} tools={tools} />
      </ToolGroup>
      <ToolGroup {...props('split')}>
        <SplitBody id={`${id}-split`} clipId={clipId} tools={tools} Sub={Sub} />
      </ToolGroup>
      <ToolGroup {...props('duotone')}>
        <DuotoneBody id={`${id}-duotone`} clipId={clipId} tools={tools} touch={touch} />
      </ToolGroup>
    </div>
  );
}
