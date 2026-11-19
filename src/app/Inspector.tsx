// MOD-App — CMP-Inspector (specs/30-experience/components/CMP-Inspector.md; boards CMP-Inspector
// "Frame", SCR-Editor default/empty wide and compact): settings for the selection, or the frame when
// nothing is selected (SCR-Editor "default"). Docked right of the preview on wide and compact layouts
// (`size.inspector`); hidden on narrow layouts, where the Edit tab's sheet holds the frame section
// (style.md "Layouts" narrow, D-038; ./EditSheet.tsx).
// Built with F-012: the panel, its plain title row, and the frame section. The selection's sections —
// a clip's Edit/Adjust/Looks/Sound tabs (a tablist named COPY-inspector.label), a text layer's and an
// audio clip's single sections — join with their features (F-005, F-006, F-007, F-008, F-010, F-011)
// in the body below the title row; until then a selection shows the title row only (build question
// 106).
// F-005: a selected video clip gets the clip tabs (a tablist named COPY-inspector.label): Edit
// (COPY-inspector.edit) with the Speed section, and Sound (COPY-inspector.sound) with F-011's sound
// section. Adjust and Looks join with F-007/F-008 and Fades with F-009 (build question 115).
// F-006: the Edit tab starts with the Position section (./PositionSection.tsx), then Speed. A photo clip,
// whose Adjust and Looks tabs come with F-007/F-008, shows its Edit section (Position) under a plain title
// row COPY-inspector.edit, since a lone tab is not wanted (build question 134). On compact layouts
// (700–999 px) the panel has a resize grip on its left edge (COPY-inspector.resize; drag or the arrow keys,
// from `size.inspector` up to 40 % of the tool's width) and no Close (build question 105, decided).
// F-007: the Adjust tab (./AdjustSection.tsx: the rows scroll under a sticky footer). A video clip's tabs are
// Edit, Adjust and Sound; a photo clip's Edit and Adjust (CMP-Inspector "photo clip"; build question 134 —
// the plain title row is gone now that the photo has two tabs). F-008: the Looks tab (COPY-looks.title) holds
// CMP-LookGallery (./LookGallery.tsx): a video clip's tabs are Edit, Adjust, Looks and Sound; a photo clip's
// Edit, Adjust and Looks (CMP-Inspector "Anatomy").
// F-009: the Edit tab ends with Fades (./FadesSection.tsx: Fade in, Fade out, the quick toggles), after Speed
// for a video clip and after the Duration row for a photo clip (./DurationSection.tsx, F-004.R8; build
// question 150).
// Implements: F-009.R1, CMP-Inspector "Anatomy" (the Edit tab holds Position, Speed or Duration, and Fades),
// Implements: F-007 UX notes, CMP-Inspector "clip Adjust", F-012.R1–R3 (the controls), F-012 UX notes, CMP-Inspector "Frame (nothing selected)" and
// "Accessibility" (tabs are a tablist named COPY-inspector.label; single-section panels use a heading;
// option groups are radio groups; swatches carry colour names), F-005 UX notes, F-006 UX notes,
// CMP-Inspector "clip Position" and "compact".
// F-010: a selected text layer shows its single section (./TextSection.tsx) under a plain title row
// COPY-inspector.text with Reset (CMP-Inspector "text layer"). Implements: F-010.R2, F-010.R3, F-010.R7, F-010.R8.
import { signal } from '@preact/signals';
import { t } from '../copy';
import type { Frame, FrameRate } from '../core';
import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ASPECT_CHOICES,
  BACKGROUND_CHOICES,
  chooseAspect,
  chooseBackground,
  chooseRate,
  frameSectionShown,
  frameSettings,
  RATE_CHOICES,
} from './frame';
import { clampWidth, gripKeyWidth, inspectorWidth, inspectorWidthRange, type WidthRange } from './inspector-width';
import { Icon } from './icons';
import { OptionGroup, type Option } from './OptionGroup';
import { placementTarget } from './placement';
import { PositionSection } from './PositionSection';
import { AdjustFooter, AdjustSection } from './AdjustSection';
import { LookGallery } from './LookGallery';
import { soundTarget } from './sound';
import { SoundSection } from './SoundSection';
import { SpeedSection } from './SpeedSection';
import { FadesSection } from './FadesSection';
import { DurationSection } from './DurationSection';
import { selectedText } from './text';
import { TextReset, TextSection } from './TextSection';

const aspectLabel = (a: Frame['aspect']): string => (a === 'original' ? t('frame.original') : a);
const backgroundLabel = (b: Frame['background']): string => (b === 'blur' ? t('frame.blur') : t(`colour.${b}`));

/**
 * CMP-Inspector "Frame (nothing selected)": Aspect as equal segments (9:16, 1:1, 4:5, 16:9, Original),
 * Frame rate as four equal segments, Background as the ten palette swatches plus a Blur chip. Each label
 * sits above its control. `touch`: the narrow sheet's touch-size rows (CMP-Inspector "narrow sheets").
 */
export function FrameSection({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const frame = frameSettings.value;
  const aspects: Option<Frame['aspect']>[] = ASPECT_CHOICES.map((a) => ({ value: a, key: a, label: aspectLabel(a) }));
  const rates: Option<FrameRate>[] = RATE_CHOICES.map((r) => ({ value: r, key: String(r), label: String(r) }));
  const backgrounds: Option<Frame['background']>[] = BACKGROUND_CHOICES.map((b) => ({
    value: b,
    key: b,
    label: backgroundLabel(b),
    swatch: b !== 'blur',
  }));
  return (
    <div class={touch ? 'tk-frame-fields tk-frame-fields--touch' : 'tk-frame-fields'} data-section="frame">
      <OptionGroup
        id={`${id}-aspect`}
        label={t('frame.aspect')}
        options={aspects}
        value={frame.aspect}
        onChoose={chooseAspect}
        variant="segments"
      />
      <OptionGroup
        id={`${id}-rate`}
        label={t('frame.rate')}
        options={rates}
        value={frame.frameRate}
        onChoose={chooseRate}
        variant="segments"
      />
      <OptionGroup
        id={`${id}-background`}
        label={t('frame.background')}
        options={backgrounds}
        value={frame.background}
        onChoose={chooseBackground}
        variant="swatches"
      />
    </div>
  );
}

const HEAD_ID = 'tk-inspector-title';

/**
 * CMP-Inspector "Accessibility": when the section holding focus goes away (the frame section when an
 * undo or redo selects a clip), focus moves to `fallback` (the panel's heading) instead of the page.
 * Whether focus was inside is noted while rendering, before the DOM changes.
 */
export function useKeepFocus(container: RefObject<HTMLElement>, fallback: RefObject<HTMLElement>, key: unknown): void {
  const had = useRef(false);
  had.current = container.current?.contains(document.activeElement) ?? false;
  useEffect(() => {
    if (!had.current) return;
    if (!container.current?.contains(document.activeElement)) fallback.current?.focus();
    // Runs when the shown section changes.
  }, [key]);
}

type ClipTab = 'edit' | 'adjust' | 'looks' | 'sound';

/** The clip tab chosen (UI state, not an edit: RULE-13). It stays when another clip is selected. */
export const clipTab = signal<ClipTab>('edit');

type TabLabel = 'inspector.edit' | 'inspector.adjust' | 'looks.title' | 'inspector.sound';
const TAB_LABELS: Readonly<Record<ClipTab, TabLabel>> = {
  edit: 'inspector.edit',
  adjust: 'inspector.adjust',
  looks: 'looks.title',
  sound: 'inspector.sound',
};

/**
 * CMP-Inspector "Anatomy": a video clip's tabs Edit, Adjust, Looks and Sound; a photo clip's Edit, Adjust and
 * Looks — no Sound (build question 134, now with tabs).
 */
const tabsOf = (kind: 'video' | 'photo'): readonly ClipTab[] =>
  kind === 'video' ? ['edit', 'adjust', 'looks', 'sound'] : ['edit', 'adjust', 'looks'];

const tabId = (tab: ClipTab): string => `tk-inspector-tab-${tab}`;
const PANEL_ID = 'tk-inspector-panel';

/**
 * CMP-Inspector "Accessibility": the clip tabs, a tablist named COPY-inspector.label (ARIA tabs pattern:
 * only the selected tab is in the Tab order; Left/Right, Home/End move and select, wrapping).
 */
function ClipTabs({
  tabs,
  current,
  selectedRef,
}: {
  readonly tabs: readonly ClipTab[];
  readonly current: ClipTab;
  readonly selectedRef: RefObject<HTMLButtonElement>;
}) {
  const pick = (i: number, list: HTMLElement | null): void => {
    const n = tabs.length;
    clipTab.value = tabs[(i + n) % n]!;
    list?.querySelectorAll<HTMLElement>('[role="tab"]')[(i + n) % n]?.focus();
  };
  return (
    <div class="tk-inspector__tabs" role="tablist" aria-label={t('inspector.label')}>
      {tabs.map((tab, i) => {
        const on = tab === current;
        return (
          <button
            key={tab}
            ref={on ? selectedRef : null}
            type="button"
            role="tab"
            id={tabId(tab)}
            class="tk-inspector__tab"
            aria-selected={on ? 'true' : 'false'}
            aria-controls={on ? PANEL_ID : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => (clipTab.value = tab)}
            onKeyDown={(e) => {
              if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
              const list = e.currentTarget.parentElement;
              const to =
                e.key === 'ArrowRight'
                  ? i + 1
                  : e.key === 'ArrowLeft'
                    ? i - 1
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (to === null) return;
              e.preventDefault();
              pick(to, list);
            }}
          >
            {t(TAB_LABELS[tab])}
          </button>
        );
      })}
    </div>
  );
}

/** `size.inspector` in CSS pixels, read from the token on the panel (the grip's narrowest width). */
function minWidthOf(el: HTMLElement): number {
  const v = parseFloat(getComputedStyle(el).getPropertyValue('--tk-size-inspector'));
  return Number.isFinite(v) && v > 0 ? v : 288;
}

/**
 * CMP-Inspector "compact": the resize grip on the panel's left edge, a window splitter (role separator,
 * named COPY-inspector.resize, its value the width in CSS pixels). Dragging it, or Left/Right (Shift: to
 * the limit), Home and End, set the width from `size.inspector` up to 40 % of the tool's width. Shown on
 * compact layouts only (CSS). The width is UI state: it stays while the page is open.
 */
function ResizeGrip({ panel }: { readonly panel: RefObject<HTMLElement> }) {
  const [range, setRange] = useState<WidthRange>({ min: 288, max: 288 });
  // The range follows the tool's width (the editor the panel sits in).
  useEffect(() => {
    const el = panel.current;
    const tool = el?.parentElement;
    if (!el || !tool) return undefined;
    const measure = (): void => {
      const r = inspectorWidthRange(tool.clientWidth, minWidthOf(el));
      setRange((old) => (old.min === r.min && old.max === r.max ? old : r));
    };
    const sizes = new ResizeObserver(measure);
    sizes.observe(tool);
    measure();
    return () => sizes.disconnect();
  }, []);
  const width = clampWidth(inspectorWidth.value ?? range.min, range);
  // The panel's width on compact layouts (the wide layout keeps `size.inspector`, CSS).
  useEffect(() => {
    panel.current?.style.setProperty('--inspector-width', `${width}px`);
  }, [width]);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  // A focusable separator is the ARIA window-splitter widget (it takes a value and the arrow keys), which
  // jsx-a11y counts as non-interactive.
  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    <div
      class="tk-inspector__grip"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('inspector.resize')}
      aria-valuenow={width}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      tabIndex={0}
      data-control="inspector-resize"
      onKeyDown={(e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const next = gripKeyWidth(e.key, e.shiftKey, width, range);
        if (next === null) return;
        e.preventDefault();
        inspectorWidth.value = next;
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        stopDrag.current?.();
        const startX = e.clientX;
        const from = width;
        const r = range;
        const touch = e.pointerType === 'touch';
        const stop = (): void => {
          removeEventListener('pointermove', move);
          removeEventListener('pointerup', stop);
          removeEventListener('pointercancel', stop);
          removeEventListener('blur', stop);
          stopDrag.current = null;
        };
        const move = (m: PointerEvent): void => {
          if (!touch && m.buttons === 0) return stop();
          // The grip is on the left edge: moving left widens the panel.
          inspectorWidth.value = clampWidth(from + (startX - m.clientX), r);
        };
        addEventListener('pointermove', move);
        addEventListener('pointerup', stop);
        addEventListener('pointercancel', stop);
        addEventListener('blur', stop);
        stopDrag.current = stop;
      }}
    >
      <Icon name="grip" size={14} />
    </div>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}

/**
 * CMP-Inspector on wide and compact layouts (hidden on narrow layouts by CSS). A selected video clip shows
 * the clip tabs Edit (Position and Speed, F-006/F-005), Adjust (F-007) and Sound (F-011); a selected photo
 * clip Edit (Position) and Adjust (build question 134); a selected audio clip the sound section under a
 * plain title row (COPY-inspector.sound, F-011); nothing selected, the frame.
 */
export function Inspector() {
  const frame = frameSectionShown.value;
  const clip = frame ? null : placementTarget.value;
  const tabs = clip ? tabsOf(clip.kind) : null;
  const text = frame || tabs ? null : selectedText.value;
  const sound = !frame && !tabs && !text && soundTarget.value !== null;
  // A tab the clip doesn't have (Sound on a photo) shows its Edit tab; the choice stays for the next video.
  const tab: ClipTab = tabs?.includes(clipTab.value) ? clipTab.value : 'edit';
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedTab = useRef<HTMLButtonElement>(null);
  const section = frame ? 'frame' : tabs ? `clip-${tab}` : text ? 'text' : sound ? 'sound' : 'selection';
  useKeepFocus(panel, tabs ? selectedTab : heading, section);
  if (tabs)
    return (
      <aside ref={panel} class="tk-inspector" aria-label={t('inspector.label')} data-section={section}>
        <ResizeGrip panel={panel} />
        <header class="tk-inspector__head tk-inspector__head--tabs">
          <ClipTabs tabs={tabs} current={tab} selectedRef={selectedTab} />
        </header>
        {tab === 'adjust' ? (
          // The body scrolls under a sticky footer (CMP-Inspector "clip Adjust", style.md "Inspector body").
          <div
            class="tk-inspector__body tk-inspector__body--footed"
            role="tabpanel"
            id={PANEL_ID}
            aria-labelledby={tabId(tab)}
          >
            <div class="tk-inspector__scroll">
              <AdjustSection id="tk-inspector-adjust" />
            </div>
            <AdjustFooter id="tk-inspector-adjust" />
          </div>
        ) : (
          <div class="tk-inspector__body" role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(tab)}>
            {tab === 'edit' ? (
              <div class="tk-inspector__sections">
                <PositionSection id="tk-inspector-place" />
                <SpeedSection id="tk-inspector-speed" />
                <DurationSection id="tk-inspector-duration" />
                <FadesSection id="tk-inspector-fades" />
              </div>
            ) : tab === 'looks' ? (
              <LookGallery id="tk-inspector-looks" />
            ) : (
              <SoundSection id="tk-inspector-sound" />
            )}
          </div>
        )}
      </aside>
    );
  const title = frame
    ? t('inspector.frame')
    : text
      ? t('inspector.text')
      : sound
        ? t('inspector.sound')
        : t('inspector.label');
  return (
    <aside ref={panel} class="tk-inspector" aria-labelledby={HEAD_ID} data-section={section}>
      <ResizeGrip panel={panel} />
      <header class="tk-inspector__head">
        <h2 ref={heading} class="tk-inspector__title" id={HEAD_ID} tabIndex={-1}>
          {title}
        </h2>
        {text ? <TextReset layer={text} /> : null}
      </header>
      <div class="tk-inspector__body">
        {frame ? (
          <FrameSection id="tk-inspector" />
        ) : text ? (
          <TextSection id="tk-inspector-text" />
        ) : sound ? (
          <SoundSection id="tk-inspector-sound" />
        ) : null}
      </div>
    </aside>
  );
}
