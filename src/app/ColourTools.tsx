// MOD-App — the colour-tool groups of CMP-Inspector's Adjust tab and the phone Adjust sheet (CMP-Inspector
// "clip Adjust · colour tools", "colour mixer", "colour pop", "split toning", "duotone", "narrow / Adjust
// sheet"; F-024…F-027 UX notes). After Effects, one collapsible group per tool in RULE-24 order of use; each
// header row holds a disclosure button (title, an accent dot and COPY-colour_tools.changed while the tool is on
// and changes the picture) and, after it, the group Reset (COPY-action.reset, named
// COPY-colour_tools.reset_tool) under the same rule. Groups start collapsed; which are open is kept for the
// session (./colour-tools.ts `openTools`).
// Implements: F-024.R1/R4/R5, F-025.R1/R4/R5, F-026.R1/R4/R5, F-027.R1/R3/R5, CMP-Inspector "Accessibility"
// (disclosure buttons with an expanded state and COPY-colour_tools.changed in their name; colour range,
// colour pop and duotone choices are radio groups with names, never colour alone; hue sliders read
// COPY-colour_tools.hue_value), RULE-20 (radio groups get the arrow keys, ./OptionGroup.tsx).
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
  closePicker,
  duotoneChoice,
  duotoneHex,
  duotoneStrengthSpec,
  hueText,
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
import { OptionGroup, type Option } from './OptionGroup';
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
  stacked,
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
  readonly stacked?: boolean;
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
      stacked={stacked}
      gestureKey={`${clipId}:${spec.control}`}
      begin={() => beginToolDrag(clipId, spec)}
      step={(v) => setToolOnce(clipId, spec, v)}
      shown={() => toolValueNow(clipId, spec)}
      commit={(v) => setToolOnce(clipId, spec, v)}
      reset={() => resetToolValue(clipId, spec)}
    />
  );
}

/** A range's swatch (its RULE-24 reference colour, rule data), with the accent mark outside it when changed. */
const rangeSwatch = (r: ColourRangeName, changed = false) => (
  <span class="tk-ctool__swatch-wrap" aria-hidden="true">
    <span class="tk-ctool__swatch" style={{ '--ctool-swatch': RANGE_REFERENCE[r] }} />
    {changed ? <span class="tk-ctool__mark" /> : null}
  </span>
);

/** A choice's label with the chosen option's name next to it (colour is never the only cue). */
function ChoiceLabel({ id, label, chosen }: { readonly id: string; readonly label: string; readonly chosen: string }) {
  return (
    <div class="tk-ctool__choice-label">
      <span class="tk-ctool__label" id={id}>
        {label}
      </span>
      <span class="tk-ctool__chosen" aria-hidden="true">
        {chosen}
      </span>
    </div>
  );
}

const rangeName = (r: ColourRangeName): string => t(`range.${r}`);

// ── F-024 colour mixer ─────────────────────────────────────────────────────────────────────────

function MixerBody({ id, clipId, tools }: { id: string; clipId: string; tools: ColourTools | undefined }) {
  const range = mixerRange.value;
  const labelId = `${id}-range`;
  return (
    <>
      <div class="tk-ctool__choice">
        <ChoiceLabel id={labelId} label={t('mixer.range')} chosen={rangeName(range)} />
        <OptionGroup<ColourRangeName>
          id={`${id}-ranges`}
          label={t('mixer.range')}
          labelledBy={labelId}
          variant="ranges"
          value={range}
          // F-024.AC9: choosing the range shown is UI state, not an undo step.
          onChoose={(r) => (mixerRange.value = r)}
          options={COLOUR_RANGES.map((r) => {
            const changed = rangeChanged(tools, r);
            return {
              value: r,
              key: r,
              label: changed ? t('mixer.range_changed', { range: rangeName(r) }) : rangeName(r),
              content: rangeSwatch(r, changed),
              named: true,
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
      <div class="tk-ctool__choice">
        <ChoiceLabel id={labelId} label={t('pop.colour')} chosen={none ? t('pop.none') : rangeName(colour)} />
        <OptionGroup<ColourRangeName | null>
          id={`${id}-colours`}
          label={t('pop.colour')}
          labelledBy={labelId}
          describedBy={helpId}
          variant="ranges"
          value={colour}
          onChoose={(c) => choosePop(clipId, c)}
          options={[
            { value: null, key: 'none', label: t('pop.none'), chip: true },
            ...COLOUR_RANGES.map((r) => ({
              value: r,
              key: r,
              label: rangeName(r),
              content: rangeSwatch(r),
              named: true,
            })),
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
  touch,
}: {
  id: string;
  clipId: string;
  tools: ColourTools | undefined;
  Sub: 'h4' | 'h5';
  touch: boolean;
}) {
  const side = (which: 'shadows' | 'highlights') => (
    <div class="tk-ctool__sub" role="group" aria-labelledby={`${id}-${which}`}>
      <Sub class="tk-ctool__sub-title" id={`${id}-${which}`}>
        {t(`split.${which}`)}
      </Sub>
      {/* On phones the 360° hue slider takes the full width, its label above it. */}
      <ToolRow
        id={id}
        clipId={clipId}
        tools={tools}
        spec={splitSpec(`${which}Hue`)}
        label={t('split.hue')}
        name={t(`split.${which}_hue`)}
        valueText={hueText}
        track={HUE_WHEEL_TRACK}
        stacked={touch}
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

const pairName = (c: DuotoneChoice | null): string =>
  c === null
    ? t('duotone.none')
    : c === 'custom'
      ? t('duotone.custom')
      : t(DUOTONE_PAIR_COLOURS[c].copyId as Extract<MessageId, `duotone.pair_${string}`>);

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
  // Wide: the popover belongs to this group; when the group goes (collapsed, another tab, another clip) it
  // closes, so it never comes back with a stale "before" colour (CMP-ColourPicker "Behavior").
  useEffect(() => (touch ? undefined : () => closePicker(false)), [touch]);
  const options: Option<DuotoneChoice | null>[] = [
    { value: null, key: 'none', label: pairName(null), chip: true },
    ...DUOTONE_PAIRS.map((p) => ({
      value: p,
      key: p,
      label: pairName(p),
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
      named: true,
    })),
    { value: 'custom', key: 'custom', label: pairName('custom'), chip: true },
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
      <div class="tk-ctool__choice">
        <ChoiceLabel id={labelId} label={t('duotone.pairs')} chosen={pairName(choice)} />
        <OptionGroup<DuotoneChoice | null>
          id={`${id}-choice`}
          label={t('duotone.pairs')}
          labelledBy={labelId}
          variant="pairs"
          value={choice}
          onChoose={(c) => pickDuotone(clipId, c)}
          options={options}
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
              <span class="tk-ctool__marker">
                <span class="tk-ctool__dot" aria-hidden="true" />
                <span class="tk-ctool__state">{t('colour_tools.changed')}</span>
              </span>
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
        <SplitBody id={`${id}-split`} clipId={clipId} tools={tools} Sub={Sub} touch={touch} />
      </ToolGroup>
      <ToolGroup {...props('duotone')}>
        <DuotoneBody id={`${id}-duotone`} clipId={clipId} tools={tools} touch={touch} />
      </ToolGroup>
    </div>
  );
}
