// MOD-App — CMP-Inspector's Adjust tab and the phone Adjust sheet's rows (specs/30-experience/components/
// CMP-Inspector.md "clip Adjust" and "narrow sheets"; board CMP-Inspector "clip Adjust"): the heading Adjust
// (COPY-inspector.adjust) with Reset all (COPY-action.reset_all); the groups Light (COPY-adjust.group_light:
// Brightness, Contrast, Highlights, Shadows), Colour (COPY-adjust.group_colour: Temperature, Tint,
// Saturation, Vibrance) and Effects (COPY-adjust.group_effects: Fade, Sharpen, Vignette, Grain). Each row has
// its label, a slider (thin track, accent fill from the centre or the start, a centre tick on bipolar ones,
// a knob with a strong ring at the default and an accent ring when changed), a number field with the same
// label ("+12", "−8") and a per-row Reset (COPY-action.reset) shown only when changed. The footer holds Hold
// to compare (COPY-action.compare), Copy colour and Paste colour (COPY-action.copy_look,
// COPY-action.paste_look; Paste unavailable with nothing copied) and Apply to all clips
// (COPY-action.apply_all); on phones one touch-size row: Hold to compare (fills the row), Apply to all clips
// and More (COPY-action.more) whose menu holds Copy colour and Paste colour.
// Implements: F-007.R1 (live preview while the value changes), F-007.R3, F-007.R4, F-007.R6 (every slider
// has a paired number field; arrow keys step 1, typed values clamp to the range), F-007.R7 (compare by
// pointer, touch, Space/Enter or \), F-007 UX notes, CMP-Inspector "Behavior" (one undo step per slider
// movement; the grouping is for reading only) and "Accessibility" (the slider and its field share the
// label; unavailable actions are disabled; touch targets in sheets meet RULE-21).
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../copy';
import type { AdjustmentName } from '../core';
import {
  ADJUST_GROUPS,
  adjustTarget,
  applyColourToAll,
  beginAdjustDrag,
  canApplyAll,
  canPaste,
  comparing,
  copyColour,
  holdCompare,
  isBipolar,
  pasteColour,
  rangeOf,
  releaseCompare,
  resetAll,
  resetOne,
  setAdjustmentOnce,
  signedLabel,
  type AdjustDrag,
} from './adjust';
import { Icon } from './icons';
import { NumberField } from './NumberField';

/**
 * One adjustment slider: keys are one step each; one pointer movement is one step measured from where it
 * began (F-014 gesture, Q104). A release anywhere, the window losing focus, or another clip becoming the
 * selection ends the movement; no pointer capture (in WebKit a captured range input no longer drags).
 */
function AdjustSlider({
  clipId,
  name,
  value,
  labelledBy,
}: {
  readonly clipId: string;
  readonly name: AdjustmentName;
  readonly value: number;
  readonly labelledBy: string;
}) {
  const drag = useRef<AdjustDrag | null>(null);
  const held = useRef(false);
  const endDrag = useRef((): void => {
    removeEventListener('pointerup', endDrag.current);
    removeEventListener('pointercancel', endDrag.current);
    removeEventListener('blur', endDrag.current);
    held.current = false;
    drag.current?.end();
    drag.current = null;
  });
  // Another clip becoming the selection mid-drag ends the movement: its moves never reach that clip. The
  // pointer still down for the previous clip is ignored until it is released.
  const orphan = useRef(false);
  useEffect(
    () => () => {
      if (held.current) {
        orphan.current = true;
        const clear = (): void => {
          orphan.current = false;
          removeEventListener('pointerup', clear);
          removeEventListener('pointercancel', clear);
          removeEventListener('blur', clear);
        };
        addEventListener('pointerup', clear);
        addEventListener('pointercancel', clear);
        addEventListener('blur', clear);
      }
      endDrag.current();
    },
    [clipId],
  );
  const end = endDrag.current;
  const { min, max } = rangeOf(name);
  const bipolar = isBipolar(name);
  // The accent fill runs from the default (the centre, or the start) to the value (CSS: ./styles/adjust.css).
  const at = (value - min) / (max - min);
  const from = bipolar ? 0.5 : 0;
  return (
    <input
      type="range"
      class="tk-adjust__slider"
      min={min}
      max={max}
      step={1}
      value={value}
      aria-labelledby={labelledBy}
      aria-valuetext={signedLabel(value, bipolar)}
      data-control={`adjust-${name}-slider`}
      data-bipolar={bipolar ? '' : undefined}
      style={{ '--adjust-lo': String(Math.min(from, at)), '--adjust-hi': String(Math.max(from, at)) }}
      onPointerDown={() => {
        end();
        orphan.current = false;
        addEventListener('pointerup', end);
        addEventListener('pointercancel', end);
        addEventListener('blur', end);
        held.current = true;
      }}
      onInput={(e) => {
        const v = Number(e.currentTarget.value);
        if (orphan.current) {
          e.currentTarget.value = String(value);
          return;
        }
        if (held.current) {
          // The movement starts with its first move. Undo, redo or an outside edit mid-drag cut it (F-014
          // onCut): the slider is controlled, so it shows the restored value, and the next move starts anew.
          if (!drag.current?.active) drag.current = beginAdjustDrag(clipId, name, () => undefined);
          drag.current.set(v);
        } else {
          // A key on the slider: one step per key.
          setAdjustmentOnce(clipId, name, v);
        }
        e.currentTarget.value = String(adjustTarget.peek()?.adjustments[name] ?? v);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onBlur={end}
      onChange={end}
    />
  );
}

function AdjustRow({
  prefix,
  clipId,
  name,
  value,
}: {
  prefix: string;
  clipId: string;
  name: AdjustmentName;
  value: number;
}) {
  const labelId = `${prefix}-${name}`;
  const { min, max } = rangeOf(name);
  const changed = value !== 0;
  return (
    <div
      class="tk-adjust__row"
      role="group"
      aria-labelledby={labelId}
      data-adjustment={name}
      data-changed={changed ? '' : undefined}
    >
      <span class="tk-adjust__label" id={labelId}>
        {t(`adjust.${name}`)}
      </span>
      <AdjustSlider clipId={clipId} name={name} value={value} labelledBy={labelId} />
      <NumberField
        class="tk-adjust__number"
        control={`adjust-${name}-field`}
        min={min}
        max={max}
        value={value}
        signed={isBipolar(name)}
        labelledBy={labelId}
        onCommit={(v) => setAdjustmentOnce(clipId, name, v)}
      />
      {changed ? (
        <button
          type="button"
          class="tk-icon-button tk-adjust__reset"
          aria-label={t('action.reset')}
          aria-describedby={labelId}
          title={t('action.reset')}
          data-action="reset-adjustment"
          onClick={() => resetOne(clipId, name)}
        >
          <Icon name="reset" size={12} />
        </button>
      ) : (
        <span class="tk-adjust__reset-space" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * The Adjust rows: the heading with Reset all, then the three groups. The title is a level-3 heading in
 * the inspector's tab and the level-2 title of the phone sheet; groups are one level below. `touch`: the
 * narrow sheet's touch-size rows (CMP-Inspector "narrow sheets").
 */
export function AdjustSection({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const target = adjustTarget.value;
  if (!target) return null;
  const headId = `${id}-title`;
  const Title = touch ? 'h2' : 'h3';
  const Group = touch ? 'h3' : 'h4';
  return (
    <section class={touch ? 'tk-adjust tk-adjust--touch' : 'tk-adjust'} data-section="adjust" aria-labelledby={headId}>
      <div class="tk-adjust__head">
        <Title class="tk-adjust__title" id={headId}>
          {t('inspector.adjust')}
        </Title>
        <button
          type="button"
          class="tk-adjust__reset-all"
          data-action="reset-all"
          aria-disabled={target.changed ? undefined : 'true'}
          onClick={() => {
            if (adjustTarget.peek()?.changed) resetAll(target.id);
          }}
        >
          <Icon name="reset" size={12} />
          {t('action.reset_all')}
        </button>
      </div>
      {ADJUST_GROUPS.map(({ group, names }) => {
        const groupId = `${id}-${group}`;
        return (
          <div key={group} class="tk-adjust__group" role="group" aria-labelledby={groupId}>
            <Group class="tk-adjust__group-title" id={groupId}>
              {t(`adjust.group_${group}`)}
            </Group>
            {names.map((name) => (
              <AdjustRow key={name} prefix={id} clipId={target.id} name={name} value={target.adjustments[name] ?? 0} />
            ))}
          </div>
        );
      })}
    </section>
  );
}

/**
 * Hold to compare: held by a pointer or touch (until released anywhere, or the window loses focus) or by
 * Space / Enter (until the key comes up). Not an undo step (F-007.R7).
 */
function CompareButton({ touch }: { readonly touch: boolean }) {
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const release = (): void => {
    stop.current?.();
  };
  const hold = (): void => {
    if (stop.current) return;
    holdCompare('control');
    const end = (): void => {
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      removeEventListener('blur', end);
      stop.current = null;
      releaseCompare('control');
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    addEventListener('blur', end);
    stop.current = end;
  };
  return (
    <button
      type="button"
      class={
        touch
          ? 'tk-button tk-button--ghost tk-adjust__compare tk-adjust__touch'
          : 'tk-button tk-button--ghost tk-adjust__compare'
      }
      data-action="compare"
      data-held={comparing.value !== null ? '' : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        hold();
      }}
      // A long touch would open the context menu or select the label instead.
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.altKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (!e.repeat) hold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          release();
        }
      }}
      onBlur={release}
    >
      <Icon name="compare" size={16} />
      {t('action.compare')}
    </button>
  );
}

function FooterButton({
  icon,
  label,
  action,
  available,
  onActivate,
  touch,
}: {
  readonly icon: 'copyColour' | 'pasteColour' | 'applyAll';
  readonly label: string;
  readonly action: string;
  readonly available: boolean;
  readonly onActivate: () => void;
  readonly touch: boolean;
}) {
  return (
    <button
      type="button"
      class={
        touch
          ? 'tk-button tk-button--ghost tk-adjust__action tk-adjust__touch'
          : 'tk-button tk-button--ghost tk-adjust__action'
      }
      data-action={action}
      disabled={!available}
      onClick={onActivate}
    >
      <Icon name={icon} size={16} />
      {label}
    </button>
  );
}

/**
 * The phone footer's More (COPY-action.more) and its menu with Copy colour and Paste colour (ARIA menu
 * button: the menu opens on its first item; Up/Down move, Home/End, Esc closes and returns to the button;
 * a click outside closes it).
 */
function MoreMenu({ id, clipId }: { readonly id: string; readonly clipId: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = `${id}-more-menu`;
  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (e: PointerEvent): void => {
      const n = e.target as Node | null;
      if (n && (menu.current?.contains(n) || button.current?.contains(n))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = (focus: boolean): void => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  const paste = canPaste.value;
  const items: readonly {
    action: string;
    label: string;
    icon: 'copyColour' | 'pasteColour';
    ok: boolean;
    run: () => void;
  }[] = [
    {
      action: 'copy-colour',
      label: t('action.copy_look'),
      icon: 'copyColour',
      ok: true,
      run: () => copyColour(clipId),
    },
    {
      action: 'paste-colour',
      label: t('action.paste_look'),
      icon: 'pasteColour',
      ok: paste,
      run: () => pasteColour(clipId),
    },
  ];
  return (
    <span class="tk-adjust__more">
      <button
        ref={button}
        type="button"
        class="tk-icon-button tk-adjust__touch tk-adjust__more-button"
        aria-label={t('action.more')}
        title={t('action.more')}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? menuId : undefined}
        data-action="more"
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" size={20} />
      </button>
      {open ? (
        <div
          ref={menu}
          id={menuId}
          class="tk-adjust__menu"
          role="menu"
          // Focus sits on its items (roving); the menu itself is reachable for the ARIA pattern.
          tabIndex={-1}
          aria-label={t('action.more')}
          onKeyDown={(e) => {
            const list = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
            const at = list.indexOf(document.activeElement as HTMLElement);
            const n = list.length;
            const to =
              e.key === 'ArrowDown'
                ? (at + 1) % n
                : e.key === 'ArrowUp'
                  ? (at + n - 1) % n
                  : e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? n - 1
                      : null;
            if (to !== null) {
              e.preventDefault();
              list[to]?.focus();
            } else if (e.key === 'Escape' || e.key === 'Tab') {
              if (e.key === 'Escape') e.preventDefault();
              close(e.key === 'Escape');
            }
          }}
        >
          {items.map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              class="tk-adjust__menu-item"
              data-action={item.action}
              aria-disabled={item.ok ? undefined : 'true'}
              onClick={() => {
                if (!item.ok) return;
                item.run();
                close(true);
              }}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/**
 * The sticky footer under the Adjust rows (CMP-Inspector "clip Adjust"; on phones "narrow sheets").
 */
export function AdjustFooter({ id, touch = false }: { readonly id: string; readonly touch?: boolean }) {
  const target = adjustTarget.value;
  if (!target) return null;
  const applyAll = (
    <FooterButton
      icon="applyAll"
      label={t('action.apply_all')}
      action="apply-all"
      available={canApplyAll.value}
      onActivate={() => applyColourToAll(target.id)}
      touch={touch}
    />
  );
  if (touch)
    return (
      <div class="tk-adjust__foot tk-adjust__foot--touch" data-section="adjust-footer">
        <CompareButton touch />
        {applyAll}
        <MoreMenu id={id} clipId={target.id} />
      </div>
    );
  return (
    <div class="tk-adjust__foot" data-section="adjust-footer">
      <CompareButton touch={false} />
      <div class="tk-adjust__foot-row">
        <FooterButton
          icon="copyColour"
          label={t('action.copy_look')}
          action="copy-colour"
          available
          onActivate={() => copyColour(target.id)}
          touch={false}
        />
        <FooterButton
          icon="pasteColour"
          label={t('action.paste_look')}
          action="paste-colour"
          available={canPaste.value}
          onActivate={() => pasteColour(target.id)}
          touch={false}
        />
      </div>
      {applyAll}
    </div>
  );
}
