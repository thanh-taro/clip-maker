// MOD-App — CMP-LookGallery (specs/30-experience/components/CMP-LookGallery.md; board CMP-LookGallery): in
// CMP-Inspector's Looks tab (wide and compact) and the phone Looks sheet (narrow). A pill group control
// (a tablist named COPY-looks.groups: Natural, Film, Cinematic, Black & White) whose pills share the width;
// the group's tiles — None and its four looks, each a live thumbnail with its name — as a radio group named
// COPY-looks.title (three columns in the inspector; one row on phones, four visible and scrolling sideways
// under a trailing fade below 360 px); the chosen tile has the accent outline, a check badge and an accent
// name; a muted status line COPY-looks.previewing names a previewed look; the Intensity slider and field
// (COPY-looks.intensity), unavailable while None is chosen.
// Pointer hover or keyboard focus on a tile previews its look on the selected clip without an undo step; a
// click, tap or Enter / Space chooses it as one step; on touch every tap is a choice (no hover preview).
// Arrow keys move between tiles (a radio group's keys, RULE-20), previewing as they go; Home / End too.
// Implements: F-008.R1 (groups, thumbnails, placeholders while drawing), F-008.R2, F-008.R3, F-008.R5,
// F-008 UX notes, CMP-LookGallery "Behavior" and "Accessibility" (tablist; radio group; chosen shown by
// outline and check, not colour alone; previewing announced as a status; touch-size targets in the sheet),
// RULE-09, RULE-13, RULE-21.
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../copy';
import { LOOKS, RULE_09, type LookGroup, type LookId } from '../core';
import { Icon } from './icons';
import {
  beginIntensityDrag,
  chooseLook,
  endLookPreview,
  ensureLooks,
  galleryGroup,
  GROUPS,
  groupLooks,
  lookTarget,
  previewing,
  previewLook,
  setIntensityOnce,
  shownGroup,
  thumbnails,
  watchThumbnails,
} from './looks';
import { NumberField } from './NumberField';
import { useSliderGesture } from './slider-gesture';

const lookName = (id: string): string => (id in LOOKS ? t(LOOKS[id as LookId].copyId as 'look.natural_fresh') : id);

/** CSS pixels of a thumbnail's longer tile side; the engine draws at up to twice that (device pixels). */
const THUMB_CSS = 80;

/** A thumbnail: the engine's bitmap drawn into a canvas (kept, so switching groups redraws at once). */
function Thumb({ bitmap }: { readonly bitmap: ImageBitmap | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !bitmap) return;
    c.width = bitmap.width;
    c.height = bitmap.height;
    c.getContext('2d')?.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  if (!bitmap)
    // CMP-LookGallery "drawing": a placeholder with a progress icon; the name and choosing stay available.
    return (
      <span class="tk-looks__thumb tk-looks__thumb--drawing" data-drawing="">
        <Icon name="loader" size={16} class="tk-looks__spinner" />
      </span>
    );
  return <canvas ref={ref} class="tk-looks__thumb" aria-hidden="true" data-drawn="" />;
}

/**
 * RULE-20 (a radio group gets the arrow keys): Left/Up and Right/Down move focus to the previous or next tile
 * (wrapping), Home/End to the first or last; focus previews, Enter or Space chooses.
 */
function moveAmongTiles(e: JSX.TargetedKeyboardEvent<HTMLButtonElement>): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const list = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
  const at = list.indexOf(e.currentTarget);
  const n = list.length;
  const to =
    e.key === 'ArrowRight' || e.key === 'ArrowDown'
      ? (at + 1) % n
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        ? (at + n - 1) % n
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? n - 1
            : null;
  if (to === null) return;
  e.preventDefault();
  list[to]?.focus();
}

interface TileProps {
  readonly lookId: string | null;
  readonly chosen: boolean;
  readonly focusable: boolean;
  readonly bitmap: ImageBitmap | undefined;
  readonly onChoose: () => void;
}

function Tile({ lookId, chosen, focusable, bitmap, onChoose }: TileProps) {
  const name = lookId === null ? t('looks.none') : lookName(lookId);
  return (
    <button
      type="button"
      role="radio"
      class="tk-looks__tile"
      aria-checked={chosen ? 'true' : 'false'}
      tabIndex={focusable ? 0 : -1}
      data-look={lookId ?? 'none'}
      onClick={onChoose}
      onKeyDown={moveAmongTiles}
      onFocus={() => previewLook(lookId)}
      onBlur={(e) => {
        // Focus left the tiles without choosing: the preview returns (another tile takes it over itself).
        const next = e.relatedTarget as HTMLElement | null;
        if (!next?.closest?.('.tk-looks__tiles')) endLookPreview();
      }}
      onPointerEnter={(e) => {
        // RULE-09: on touch every tap is a choice — no hover preview.
        if (e.pointerType !== 'touch') previewLook(lookId);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'touch') return;
        // Back to the focused tile's preview, or to the clip as it is.
        const focused = document.activeElement as HTMLElement | null;
        const tile = focused?.closest?.('.tk-looks__tile') as HTMLElement | null;
        if (tile && tile !== e.currentTarget && tile.dataset['look'])
          previewLook(tile.dataset['look'] === 'none' ? null : tile.dataset['look']);
        else endLookPreview();
      }}
    >
      <span class="tk-looks__frame">
        {lookId === null ? (
          <span class="tk-looks__thumb tk-looks__thumb--none">
            <Icon name="close" size={16} />
          </span>
        ) : (
          <Thumb bitmap={bitmap} />
        )}
        {chosen ? (
          <span class="tk-looks__check" aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
        ) : null}
      </span>
      <span class="tk-looks__name">{name}</span>
    </button>
  );
}

/** The group pills: a tablist named COPY-looks.groups (Left/Right, Home/End move and select, wrapping). */
function GroupPills({ id, group }: { readonly id: string; readonly group: LookGroup }) {
  const pick = (i: number, list: HTMLElement | null): void => {
    const n = GROUPS.length;
    galleryGroup.value = GROUPS[(i + n) % n]!.group;
    list?.querySelectorAll<HTMLElement>('[role="tab"]')[(i + n) % n]?.focus();
  };
  return (
    <div class="tk-looks__groups" role="tablist" aria-label={t('looks.groups')}>
      {GROUPS.map((g, i) => {
        const on = g.group === group;
        return (
          <button
            key={g.group}
            type="button"
            role="tab"
            id={`${id}-group-${i}`}
            class="tk-looks__group"
            aria-selected={on ? 'true' : 'false'}
            aria-controls={on ? `${id}-panel` : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => (galleryGroup.value = g.group)}
            onKeyDown={(e) => {
              if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
              const to =
                e.key === 'ArrowRight'
                  ? i + 1
                  : e.key === 'ArrowLeft'
                    ? i - 1
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? GROUPS.length - 1
                        : null;
              if (to === null) return;
              e.preventDefault();
              pick(to, e.currentTarget.parentElement);
            }}
          >
            {t(g.copy as 'looks.group_natural')}
          </button>
        );
      })}
    </div>
  );
}

/** The Intensity row: label, slider and field (one undo step per movement, typed value or key). */
function IntensityRow({
  id,
  clipId,
  value,
  available,
}: {
  id: string;
  clipId: string;
  value: number;
  available: boolean;
}) {
  const labelId = `${id}-intensity`;
  const gesture = useSliderGesture({
    key: clipId,
    value,
    begin: () => beginIntensityDrag(clipId, () => undefined),
    step: (v) => void setIntensityOnce(clipId, v),
    shown: () => lookTarget.peek()?.look?.intensity,
  });
  const { minIntensity: min, maxIntensity: max } = RULE_09;
  return (
    <div
      class="tk-adjust__row tk-looks__intensity"
      role="group"
      aria-labelledby={labelId}
      data-changed={available ? '' : undefined}
      data-control="look-intensity"
    >
      <span class="tk-adjust__label" id={labelId}>
        {t('looks.intensity')}
      </span>
      <input
        type="range"
        class="tk-adjust__slider"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={!available}
        aria-labelledby={labelId}
        aria-valuetext={String(value)}
        data-control="look-intensity-slider"
        style={{ '--adjust-lo': '0', '--adjust-hi': String(available ? (value - min) / (max - min) : 0) }}
        {...gesture}
      />
      <NumberField
        class="tk-adjust__number"
        control="look-intensity-field"
        min={min}
        max={max}
        value={value}
        labelledBy={labelId}
        disabled={!available}
        onCommit={(v) => setIntensityOnce(clipId, v) ?? value}
      />
      <span class="tk-adjust__reset-space" aria-hidden="true" />
    </div>
  );
}

/**
 * CMP-LookGallery for the selected video or photo clip. `touch`: the phone sheet's touch-size variant
 * (CMP-LookGallery "narrow / chosen").
 */
export function LookGallery({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const target = lookTarget.value;
  // RULE-09 thumbnails are drawn while the gallery is shown; looks that failed to load are read again.
  useEffect(() => watchThumbnails(Math.round(THUMB_CSS * Math.min(2, window.devicePixelRatio || 1))), []);
  useEffect(() => void ensureLooks(), []);
  // Leaving the gallery ends a preview it started.
  useEffect(() => () => endLookPreview(), []);
  if (!target) return null;
  const group = shownGroup.value;
  const ids = groupLooks(group);
  const chosen = target.look?.id ?? null;
  const shown: (string | null)[] = [null, ...ids];
  // Roving focus: the chosen tile when it is in this group, else None.
  const focusIndex = Math.max(0, shown.indexOf(chosen));
  const thumbs = thumbnails.value.clipId === target.id ? thumbnails.value.bitmaps : new Map<string, ImageBitmap>();
  const preview = previewing.value;
  const status =
    preview && preview.clipId === target.id
      ? t('looks.previewing', { look: preview.lookId === null ? t('looks.none') : lookName(preview.lookId) })
      : '';
  const groupIndex = GROUPS.findIndex((g) => g.group === group);
  return (
    <section
      class={touch ? 'tk-looks tk-looks--touch tk-adjust--touch' : 'tk-looks'}
      data-section="looks"
      aria-label={t('looks.title')}
    >
      <GroupPills id={id} group={group} />
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-group-${groupIndex}`} class="tk-looks__panel">
        <div class="tk-looks__tiles" role="radiogroup" aria-label={t('looks.title')}>
          {shown.map((lookId, i) => (
            <Tile
              key={lookId ?? 'none'}
              lookId={lookId}
              chosen={lookId === chosen}
              focusable={i === focusIndex}
              bitmap={lookId === null ? undefined : thumbs.get(lookId)}
              onChoose={() => chooseLook(target.id, lookId)}
            />
          ))}
        </div>
      </div>
      <p class="tk-looks__status" role="status">
        {status ? <Icon name="compare" size={14} /> : null}
        {status}
      </p>
      <IntensityRow
        id={id}
        clipId={target.id}
        value={target.look?.intensity ?? RULE_09.defaultIntensity}
        available={target.look !== null}
      />
    </section>
  );
}
