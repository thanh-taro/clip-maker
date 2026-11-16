// MOD-App — CMP-Inspector (specs/30-experience/components/CMP-Inspector.md; boards CMP-Inspector
// "Frame", SCR-Editor default/empty wide and compact): settings for the selection, or the frame when
// nothing is selected (SCR-Editor "default"). Docked right of the preview on wide and compact layouts
// (`size.inspector`); hidden on narrow layouts, where the Edit tab's sheet holds the frame section
// (style.md "Layouts" narrow, D-038; ./EditSheet.tsx).
// Built with F-012: the panel, its plain title row, and the frame section. The selection's sections —
// a clip's Edit/Adjust/Looks/Sound tabs (a tablist named COPY-inspector.label), a text layer's and an
// audio clip's single sections — join with their features (F-005, F-006, F-007, F-008, F-010, F-011)
// in the body below the title row; until then a selection shows the title row only (build question
// 106). The compact layout's resize grip and close (COPY-inspector.resize) are not built yet (build
// question 105).
// F-005: a selected video clip gets the clip tabs (a tablist named COPY-inspector.label): Edit
// (COPY-inspector.edit) with the Speed section, and Sound (COPY-inspector.sound) with F-011's sound
// section. Adjust and Looks join with F-007/F-008, Position with F-006 and Fades with F-009 (build
// question 115). A photo clip keeps the plain title row until its Edit tab has a section (Duration, Fades).
// Implements: F-012.R1–R3 (the controls), F-012 UX notes, CMP-Inspector "Frame (nothing selected)" and
// "Accessibility" (tabs are a tablist named COPY-inspector.label; single-section panels use a heading;
// option groups are radio groups; swatches carry colour names), F-005 UX notes.
import { signal } from '@preact/signals';
import { t } from '../copy';
import type { Frame, FrameRate } from '../core';
import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
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
import { OptionGroup, type Option } from './OptionGroup';
import { soundTarget } from './sound';
import { SoundSection } from './SoundSection';
import { speedTarget } from './speed';
import { SpeedSection } from './SpeedSection';

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

type ClipTab = 'edit' | 'sound';

/** The clip tab shown (UI state, not an edit: RULE-13). It stays when another clip is selected. */
export const clipTab = signal<ClipTab>('edit');

const CLIP_TABS: readonly { tab: ClipTab; label: 'inspector.edit' | 'inspector.sound' }[] = [
  { tab: 'edit', label: 'inspector.edit' },
  { tab: 'sound', label: 'inspector.sound' },
];

const tabId = (tab: ClipTab): string => `tk-inspector-tab-${tab}`;
const PANEL_ID = 'tk-inspector-panel';

/**
 * CMP-Inspector "Accessibility": the clip tabs, a tablist named COPY-inspector.label (ARIA tabs pattern:
 * only the selected tab is in the Tab order; Left/Right, Home/End move and select, wrapping).
 */
function ClipTabs({ selectedRef }: { readonly selectedRef: RefObject<HTMLButtonElement> }) {
  const current = clipTab.value;
  const pick = (i: number, list: HTMLElement | null): void => {
    const n = CLIP_TABS.length;
    const next = CLIP_TABS[(i + n) % n]!;
    clipTab.value = next.tab;
    list?.querySelectorAll<HTMLElement>('[role="tab"]')[(i + n) % n]?.focus();
  };
  return (
    <div class="tk-inspector__tabs" role="tablist" aria-label={t('inspector.label')}>
      {CLIP_TABS.map(({ tab, label }, i) => {
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
                        ? CLIP_TABS.length - 1
                        : null;
              if (to === null) return;
              e.preventDefault();
              pick(to, list);
            }}
          >
            {t(label)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * CMP-Inspector on wide and compact layouts (hidden on narrow layouts by CSS). A selected video clip shows
 * the clip tabs (F-005: Edit with Speed, Sound); a selected audio clip the sound section under a plain
 * title row (COPY-inspector.sound, F-011); nothing selected, the frame.
 */
export function Inspector() {
  const frame = frameSectionShown.value;
  const tabs = !frame && speedTarget.value !== null;
  const sound = !frame && !tabs && soundTarget.value !== null;
  const tab = clipTab.value;
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedTab = useRef<HTMLButtonElement>(null);
  const section = frame ? 'frame' : tabs ? `clip-${tab}` : sound ? 'sound' : 'selection';
  useKeepFocus(panel, tabs ? selectedTab : heading, section);
  if (tabs)
    return (
      <aside ref={panel} class="tk-inspector" aria-label={t('inspector.label')} data-section={section}>
        <header class="tk-inspector__head tk-inspector__head--tabs">
          <ClipTabs selectedRef={selectedTab} />
        </header>
        <div class="tk-inspector__body" role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(tab)}>
          {tab === 'edit' ? <SpeedSection id="tk-inspector-speed" /> : <SoundSection id="tk-inspector-sound" />}
        </div>
      </aside>
    );
  return (
    <aside ref={panel} class="tk-inspector" aria-labelledby={HEAD_ID} data-section={section}>
      <header class="tk-inspector__head">
        <h2 ref={heading} class="tk-inspector__title" id={HEAD_ID} tabIndex={-1}>
          {frame ? t('inspector.frame') : sound ? t('inspector.sound') : t('inspector.label')}
        </h2>
      </header>
      <div class="tk-inspector__body">
        {frame ? <FrameSection id="tk-inspector" /> : sound ? <SoundSection id="tk-inspector-sound" /> : null}
      </div>
    </aside>
  );
}
