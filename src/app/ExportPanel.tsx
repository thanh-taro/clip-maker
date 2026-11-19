// MOD-App — CMP-ExportPanel (specs/30-experience/components/CMP-ExportPanel.md; boards CMP-ExportPanel and
// SCR-Editor "exporting-setup" wide and narrow): the kinds Video (F-015), GIF and Audio only (F-016). Wide and
// compact: docked in the inspector column in place of the inspector's content; narrow: a bottom sheet above
// the tab bar, under the transport and the timeline peek (CSS, export.css). A non-modal dialog named by
// COPY-export.title: the editor stays usable (SCR-Editor "exporting-setup"); Esc, Cancel or Close closes it
// without exporting and focus returns to the toolbar's Export.
// Implements: F-015.R1/R2, F-015.AC1/AC2/AC9, F-016.R1/R2, RULE-15 (offers, default, quality or size target,
// D-020), RULE-16 (GIF range, size and rate; audio formats), CMP-ExportPanel "video · wide", "resolution
// unavailable", "lower res", "fallback", "needs clip", "gif", "audio", "no sound", "narrow", "Behavior" and
// "Accessibility".
import { effect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMB, language, t } from '../copy';
import type { ExportQuality, Micros, VideoResolution } from '../core';
import { project } from '../project';
import {
  audioOffers,
  canExport,
  chooseAudio,
  chooseGifFrom,
  chooseGifRate,
  chooseGifSize,
  chooseGifTo,
  chooseKind,
  chooseQuality,
  chooseResolution,
  chooseTarget,
  chosenAudio,
  closePanel,
  estimateView,
  exportBlock,
  exportKind,
  formatGifTime,
  gifChoice,
  gifRange,
  gifRangeFixed,
  GIF_RATES,
  GIF_SIZES,
  KINDS,
  offers,
  panelOpen,
  parseGifTime,
  parseTarget,
  QUICK_TARGETS,
  resolution,
  retryEstimate,
  sessionCaps,
  startExport,
  targetAdvice,
  videoChoice,
  type ExportKind,
  type ResolutionOffer,
} from './export';
import { openSheet } from './EditSheet';
import { audioFormatLine, audioFormatName, gifFormatLine, videoFormatLine } from './export-format';
import { Icon } from './icons';

// Narrow layouts have one sheet at a time: opening a tab bar sheet closes the panel, and opening the panel
// closes the open tab sheet (SCR-Editor "exporting-setup" narrow; CMP-ExportPanel "Behavior").
let sheetBefore = openSheet.peek();
effect(() => {
  const sheet = openSheet.value;
  if (sheet !== null && sheet !== sheetBefore && panelOpen.peek()) closePanel(false);
  sheetBefore = sheet;
});
effect(() => {
  if (panelOpen.value && openSheet.peek() !== null) openSheet.value = null;
});

const ID = 'tk-export';
const TITLE_ID = `${ID}-title`;
const tabId = (k: ExportKind): string => `${ID}-kind-${k}`;
const ADVICE_ID = `${ID}-advice`;
const LINE_ID = `${ID}-line`;

const KIND_LABEL: Readonly<Record<ExportKind, 'export.kind_video' | 'export.kind_gif' | 'export.kind_audio'>> = {
  video: 'export.kind_video',
  gif: 'export.kind_gif',
  audio: 'export.kind_audio',
};

const QUALITIES: readonly {
  readonly value: ExportQuality;
  readonly label: 'export.q_smaller' | 'export.q_balanced' | 'export.q_best';
}[] = [
  { value: 'smaller', label: 'export.q_smaller' },
  { value: 'balanced', label: 'export.q_balanced' },
  { value: 'best', label: 'export.q_best' },
];

// Resolutions are names ("1440"), never grouped numbers ("1,440"): they are passed as text.
/** The reason under the row for a size that isn't offered (always visible, CMP-ExportPanel). */
const reasonOf = (o: ResolutionOffer): string | null =>
  o.state === 'needs_source'
    ? t('export.res_needs_source', { res: String(o.resolution) })
    : o.state === 'no_encoder'
      ? t('export.res_no_encoder', { res: String(o.resolution) })
      : null;

function Resolutions() {
  const list = offers.value;
  const chosen = resolution.value;
  return (
    <fieldset class="tk-export__field" data-field="resolution">
      <legend class="tk-export__legend">{t('export.resolution')}</legend>
      <div class="tk-export__segments tk-export__segments--mono">
        {list.map((o) => {
          const reason = reasonOf(o);
          return (
            <label
              key={o.resolution}
              class="tk-export__seg"
              data-value={o.resolution}
              data-off={reason ? '' : undefined}
            >
              <input
                type="radio"
                name={`${ID}-res`}
                value={o.resolution}
                checked={o.resolution === chosen}
                disabled={reason !== null}
                aria-describedby={reason ? `${ID}-why-${o.resolution}` : undefined}
                onChange={() => chooseResolution(o.resolution)}
              />
              <span>{o.resolution}</span>
            </label>
          );
        })}
      </div>
      {list.map((o) => {
        const reason = reasonOf(o);
        return reason ? (
          <p key={o.resolution} id={`${ID}-why-${o.resolution}`} class="tk-export__why">
            <Icon name="info" size={16} />
            <span>{reason}</span>
          </p>
        ) : null;
      })}
    </fieldset>
  );
}

function Quality() {
  const choice = videoChoice.value;
  return (
    <fieldset class="tk-export__field" data-field="quality">
      <legend class="tk-export__legend">{t('export.quality')}</legend>
      <div class="tk-export__segments">
        {QUALITIES.map((q) => (
          <label key={q.value} class="tk-export__seg" data-value={q.value}>
            <input
              type="radio"
              name={`${ID}-quality`}
              value={q.value}
              checked={choice.targetMB === null && choice.quality === q.value}
              onChange={() => chooseQuality(q.value)}
            />
            <span>{t(q.label)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** RULE-15 size target: the quick choices and the whole-number field (typing a number selects it). */
function SizeLimit({ blocked }: { readonly blocked: boolean }) {
  const target = videoChoice.value.targetMB;
  const quick = target !== null && QUICK_TARGETS.includes(target);
  const custom = target !== null && !quick;
  const [text, setText] = useState(custom ? String(target) : '');
  // The field follows the choice made elsewhere (a quick choice clears it, "Use N MB" fills it).
  useEffect(() => {
    if (target === null || quick) {
      if (parseTarget(text) !== null) setText('');
    } else if (parseTarget(text) !== target) setText(String(target));
  }, [target]);
  return (
    <fieldset class="tk-export__field" data-field="size">
      <legend class="tk-export__legend">{t('export.size_limit')}</legend>
      <div class="tk-export__chips">
        {QUICK_TARGETS.map((mb) => (
          <label key={mb} class="tk-export__chip" data-value={mb}>
            <input
              type="radio"
              name={`${ID}-target`}
              value={mb}
              checked={target === mb}
              onChange={() => chooseTarget(mb)}
            />
            <span>{t('export.size_target', { size: mb })}</span>
          </label>
        ))}
      </div>
      <label class="tk-export__custom" data-on={custom ? '' : undefined} data-bad={custom && blocked ? '' : undefined}>
        <span>{t('export.size_custom')}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          class="tk-export__custom-input"
          aria-label={t('export.size_custom_label')}
          aria-describedby={custom && blocked ? ADVICE_ID : undefined}
          value={text}
          onInput={(e) => {
            const value = e.currentTarget.value;
            setText(value);
            const mb = parseTarget(value);
            if (mb !== null) chooseTarget(mb);
            else if (custom) chooseTarget(null);
          }}
        />
        <span aria-hidden="true">{t('export.size_unit')}</span>
      </label>
    </fieldset>
  );
}

/**
 * A GIF range time field (CMP-ExportPanel "gif"): m:ss with optional frames, taken on Enter or when it loses
 * focus; text that isn't a time goes back to the range's value; Esc while editing puts the value back first.
 */
function TimeField(props: {
  readonly name: 'from' | 'to';
  readonly label: string;
  readonly value: Micros;
  readonly readOnly: boolean;
  readonly onCommit: (t: Micros) => void;
}) {
  const rate = project.value.frame.frameRate;
  const shown = formatGifTime(props.value, rate, language.value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = (): void => {
    const at = parseGifTime(text, rate);
    if (at !== null) props.onCommit(at);
    // The range may have been clamped to the same value: show what is in effect either way.
    setText(formatGifTime(gifRange.peek()[props.name], rate, language.peek()));
  };
  return (
    <label class="tk-export__time" data-field={`gif-${props.name}`}>
      <span>{props.label}</span>
      <input
        type="text"
        class="tk-export__time-input"
        autoComplete="off"
        spellcheck={false}
        value={text}
        readOnly={props.readOnly}
        onInput={(e) => setText(e.currentTarget.value)}
        onChange={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape' && text !== shown) {
            e.preventDefault(); // puts the value back; a second Esc closes the panel
            setText(shown);
          }
        }}
      />
    </label>
  );
}

/** Implements: F-016.R1, RULE-16, CMP-ExportPanel "gif" — the range (From, To), size and frame rate. */
function GifSettings() {
  const range = gifRange.value;
  const fixed = gifRangeFixed.value;
  const choice = gifChoice.value;
  return (
    <>
      <fieldset class="tk-export__field" data-field="gif-range">
        <legend class="tk-export__legend">{t('export.gif_range')}</legend>
        <div class="tk-export__times">
          <TimeField
            name="from"
            label={t('export.gif_from')}
            value={range.from}
            readOnly={fixed}
            onCommit={chooseGifFrom}
          />
          <TimeField name="to" label={t('export.gif_to')} value={range.to} readOnly={fixed} onCommit={chooseGifTo} />
        </div>
      </fieldset>
      <div class="tk-export__pair">
        <fieldset class="tk-export__field tk-export__field--size" data-field="gif-size">
          <legend class="tk-export__legend">{t('export.gif_size')}</legend>
          <div class="tk-export__segments tk-export__segments--mono">
            {GIF_SIZES.map((size) => (
              <label key={size} class="tk-export__seg" data-value={size}>
                <input
                  type="radio"
                  name={`${ID}-gif-size`}
                  value={size}
                  checked={choice.size === size}
                  onChange={() => chooseGifSize(size)}
                />
                <span>{size}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset class="tk-export__field tk-export__field--rate" data-field="gif-rate">
          <legend class="tk-export__legend">{t('export.gif_rate')}</legend>
          <div class="tk-export__segments tk-export__segments--mono">
            {GIF_RATES.map((rate) => (
              <label key={rate} class="tk-export__seg" data-value={rate}>
                <input
                  type="radio"
                  name={`${ID}-gif-rate`}
                  value={rate}
                  checked={choice.rate === rate}
                  onChange={() => chooseGifRate(rate)}
                />
                <span>{rate}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </>
  );
}

/**
 * Implements: F-016.R2, RULE-16, F-023.R5, CMP-ExportPanel "audio" — the compressed format the device can
 * encode (named, default) and WAV; without a sound encoder, WAV only.
 */
function AudioSettings() {
  const chosen = chosenAudio.value;
  return (
    <fieldset class="tk-export__field" data-field="audio-format">
      <legend class="tk-export__legend">{t('export.audio_format')}</legend>
      <div class="tk-export__radios">
        {audioOffers.value.map((f) => {
          const value = f.id === 'wav' ? 'wav' : 'compressed';
          return (
            <label key={f.id} class="tk-export__radio" data-value={value}>
              <input
                type="radio"
                name={`${ID}-audio-format`}
                value={value}
                checked={chosen === value}
                onChange={() => chooseAudio(value)}
              />
              <i class="tk-export__dot" aria-hidden="true" />
              <span>
                {value === 'wav' ? t('export.audio_wav') : t('export.audio_compressed', { format: audioFormatName(f) })}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The kinds as a tab list: arrow keys, Home and End move between them and choose (CMP-ExportPanel). */
function Kinds({ selected }: { readonly selected: { current: HTMLButtonElement | null } }) {
  const kind = exportKind.value;
  const move = (ev: KeyboardEvent): void => {
    const i = KINDS.indexOf(kind);
    const n = KINDS.length;
    const next =
      ev.key === 'ArrowRight'
        ? (i + 1) % n
        : ev.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : ev.key === 'Home'
            ? 0
            : ev.key === 'End'
              ? n - 1
              : -1;
    if (next < 0) return;
    ev.preventDefault();
    chooseKind(KINDS[next]!);
    document.getElementById(tabId(KINDS[next]!))?.focus();
  };
  return (
    <div class="tk-export__kinds" role="tablist" aria-label={t('export.title')}>
      {KINDS.map((k) => (
        <button
          key={k}
          ref={k === kind ? selected : null}
          type="button"
          role="tab"
          id={tabId(k)}
          class="tk-export__kind"
          data-kind={k}
          aria-selected={k === kind ? 'true' : 'false'}
          aria-controls={`${ID}-body`}
          tabIndex={k === kind ? 0 : -1}
          onClick={() => chooseKind(k)}
          onKeyDown={move}
        >
          {t(KIND_LABEL[k])}
        </button>
      ))}
    </div>
  );
}

/**
 * Implements: F-015.R2 / AC2, D-020 — when the size target can't be met: COPY-export.target_lower_res with
 * COPY-action.use_res, or COPY-export.target_unreachable with COPY-action.use_target; a check that failed reads
 * COPY-export.target_unknown with COPY-action.try_again.
 */
function useAdvice() {
  const e = estimateView.value;
  const advice = targetAdvice(e.status === 'ready' ? e.result : e.status === 'failed' ? 'failed' : null);
  const target = videoChoice.value.targetMB;
  const r = resolution.value;
  if (exportKind.value !== 'video' || target === null || r === null || advice.kind === 'none') return null;
  if (advice.kind === 'lower_res')
    return {
      text: t('export.target_lower_res', { size: target, res: String(r), fit: String(advice.fit) }),
      action: t('action.use_res', { res: String(advice.fit) }),
      run: () => chooseResolution(advice.fit as VideoResolution),
    };
  if (advice.kind === 'unknown')
    // Review: a failed check never leaves Export disabled without a reason; it can be run again.
    return { text: t('export.target_unknown', { size: target }), action: t('action.try_again'), run: retryEstimate };
  return {
    text: t('export.target_unreachable', { size: target, min: advice.min }),
    action: t('action.use_target', { size: advice.min }),
    run: () => chooseTarget(advice.min),
  };
}

export function ExportPanel() {
  const open = panelOpen.value;
  const tab = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  void language.value;
  useEffect(() => {
    if (!open) return undefined;
    tab.current?.focus();
    // Esc closes the panel without exporting while focus is in it (CMP-ExportPanel "Behavior").
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return;
      if (!document.getElementById(ID)?.contains(document.activeElement)) return;
      ev.preventDefault();
      closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const advice = useAdvice();
  // CMP-ExportPanel "Behavior": the body scrolls the field and its message into view above the footer.
  useEffect(() => {
    if (advice) body.current?.querySelector('.tk-export__advice')?.scrollIntoView({ block: 'nearest' });
  }, [advice?.text]);
  if (!open) return null;
  const kind = exportKind.value;
  const caps = sessionCaps.value;
  const e = estimateView.value;
  const block = exportBlock.value;
  const lang = language.value;
  // The format line of the kind (COPY-export.saves_as, or COPY-export.format_note for a fallback).
  const line =
    kind === 'gif'
      ? gifFormatLine(lang)
      : kind === 'audio'
        ? audioFormatLine(audioOffers.value[0]!, chosenAudio.value, lang)
        : caps?.videoFormat
          ? videoFormatLine(caps.videoFormat, lang)
          : null;
  const ready = canExport.value;
  const estimate =
    e.status === 'ready' && e.result.reachable ? t('export.estimate', { size: formatMB(e.result.bytes) }) : '';
  return (
    <section id={ID} class="tk-export" role="dialog" aria-labelledby={TITLE_ID} data-panel="export">
      <span class="tk-export__grab" aria-hidden="true" />
      <header class="tk-export__head">
        <h2 id={TITLE_ID} class="tk-export__title">
          {t('export.title')}
        </h2>
        <button
          type="button"
          class="tk-export__icon-button"
          aria-label={t('action.close')}
          title={t('action.close')}
          onClick={() => closePanel()}
        >
          <Icon name="close" size={20} />
        </button>
      </header>
      <Kinds selected={tab} />
      <div
        ref={body}
        id={`${ID}-body`}
        class="tk-export__body"
        role="tabpanel"
        aria-labelledby={tabId(kind)}
        data-kind={kind}
      >
        {kind === 'video' ? (
          <>
            <Resolutions />
            <Quality />
            <SizeLimit blocked={advice !== null} />
          </>
        ) : kind === 'gif' ? (
          <GifSettings />
        ) : (
          <AudioSettings />
        )}
        {advice ? (
          <div class="tk-export__advice">
            <p id={ADVICE_ID} class="tk-export__warn" data-notice="target">
              <Icon name="warning" size={16} />
              <span>{advice.text}</span>
            </p>
            <button
              type="button"
              class="tk-export__button tk-export__button--outlined tk-export__use tk-export__use--body"
              onClick={advice.run}
            >
              {advice.action}
            </button>
          </div>
        ) : null}
      </div>
      <footer
        class="tk-export__foot"
        data-state={
          advice ? 'blocked' : block === 'needs_clip' ? 'needs-clip' : block === 'no_sound' ? 'no-sound' : 'ready'
        }
      >
        {/* Polite live region tied to Export as its description (CMP-ExportPanel "Accessibility"). */}
        <p id={LINE_ID} class="tk-export__line" aria-live="polite">
          {block ? (
            <span class="tk-export__note" data-notice={block}>
              {t(block === 'needs_clip' ? 'notice.needs_clip' : 'notice.no_sound_to_export')}
            </span>
          ) : advice ? null : (
            <>
              <span class="tk-export__estimate" data-estimate={e.status}>
                {estimate}
              </span>
              {line ? (
                <span class="tk-export__format" data-fallback={line.fallback ? '' : undefined}>
                  {line.text}
                </span>
              ) : null}
            </>
          )}
        </p>
        <div class="tk-export__actions">
          <button type="button" class="tk-export__button tk-export__cancel" onClick={() => closePanel()}>
            {t('action.cancel')}
          </button>
          {advice ? (
            <button
              type="button"
              class="tk-export__button tk-export__button--outlined tk-export__use tk-export__use--foot"
              onClick={advice.run}
            >
              {advice.action}
            </button>
          ) : null}
          <button
            type="button"
            class="tk-export__button tk-export__button--outlined tk-export__go"
            data-action="start-export"
            disabled={!ready}
            aria-describedby={advice ? `${ADVICE_ID} ${LINE_ID}` : LINE_ID}
            onClick={() => void startExport()}
          >
            <Icon name="export" size={16} />
            {t('action.export')}
          </button>
        </div>
      </footer>
    </section>
  );
}
