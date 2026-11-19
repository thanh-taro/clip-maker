// MOD-App — CMP-TextEditor (specs/30-experience/components/CMP-TextEditor.md; boards CMP-TextEditor, SCR-Editor
// editing-text wide and narrow): typing directly over the preview. The text layer at its position is a
// transparent multi-line text field (ADR-0012 §4: the canvas glyphs show through, the field keeps the caret and
// the selection) named COPY-text.field, with a dashed violet outline and the wrap limits as dashed guides (90 %
// of the frame's width, RULE-11); a floating bar above the frame with the count (COPY-text.count) and Done
// (COPY-text.done); the finish hint (COPY-text.finish_hint) under the frame on wide layouts. At 500 / 500 the
// count turns to the error colour and COPY-text.char_limit shows as an alert; further typing is not accepted
// and pasted text is shortened (never splitting a character, kept in NFC). Composition events let Vietnamese
// input methods compose: nothing half-composed is committed, and Esc / Mod+Enter mid-composition belong to the
// input method. On narrow layouts the top bar collapses to Undo, Redo and Done (./Toolbar.tsx) and a
// touch-size text bar with Font, Colour and Style and the read-only count sits above the on-screen keyboard;
// each opens the same picker as CMP-Inspector's text section.
// Implements: F-010.R1 (type directly), F-010.R6 / F-010.AC6 (the limit, NFC, never split), RULE-11, RULE-13
// (adding plus typing until editing ends is one step — ./text.ts), RULE-20 (keyboard shortcuts are off while
// editing; Esc or Mod+Enter or Done finishes), CMP-TextEditor "Behavior" and "Accessibility" (the field's
// name and language, the count announced politely near and at the limit, the limit notice an alert, Done a
// real button, the narrow bar's controls meet RULE-21).
import { signal } from '@preact/signals';
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { language, t } from '../copy';
import { clampText, frameIndexAt, PALETTE_HEX, projectFrames, RULE_11, contrastOf } from '../core';
import { LINE_HEIGHT, canvasMeasure, layoutText } from '../preview';
import { playhead, project } from '../project';
import { Icon } from './icons';
import { OptionGroup } from './OptionGroup';
import { useCanvasBox } from './PlacementOverlay';
import { playback } from './playback';
import { watchKeyboard } from './keyboard-inset';
import { colourOptions, faceOptions, styleOptions } from './TextSection';
import {
  countOf,
  editedLayer,
  editingText,
  finishEditing,
  insertWithin,
  onEditingClosed,
  registerEditor,
  styleText,
  typeText,
} from './text';

/** The narrow text bar's open picker (CMP-TextEditor "narrow, keyboard open"). */
const picker = signal<'font' | 'colour' | 'style' | null>(null);

const FIELD_ID = 'tk-text-field';
/** Pixels added to the field's width so the caret after the last character never wraps the line. */
const CARET_SLACK = 2;
/** CMP-TextEditor "Accessibility": the count is announced when this close to the limit. */
const ANNOUNCE_WITHIN = 20;

/** Whether Mod is down (Cmd on Apple platforms, else Ctrl; RULE-20). */
const modDown = (e: KeyboardEvent): boolean =>
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent) ? e.metaKey : e.ctrlKey;

/** CMP-TextEditor "Accessibility": `lang` from the content's language when known (Vietnamese letters). */
const VIETNAMESE = /[ăâđêôơưĂÂĐÊÔƠƯạ-ỹẠ-Ỹ]/u;
const langOf = (content: string): string | undefined => (VIETNAMESE.test(content) ? 'vi' : undefined);

/** The editor's Done (the floating bar on wide layouts; the top bar's on narrow ones, ./Toolbar.tsx). */
export function DoneButton({ variant }: { readonly variant: 'bar' | 'top' }) {
  return (
    <button
      type="button"
      class={variant === 'bar' ? 'tk-button tk-texteditor__done' : 'tk-tool tk-tool--done'}
      data-action="text-done"
      // Done keeps focus in the editor until it acts (a blur would finish editing first).
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => finishEditing()}
      onKeyDown={(e) => {
        // RULE-20: Esc finishes editing from Done too (the shortcuts are off while editing).
        if (e.key === 'Escape') {
          e.preventDefault();
          finishEditing();
        }
      }}
    >
      <Icon name="check" size={variant === 'bar' ? 16 : 20} />
      <span>{variant === 'bar' ? t('text.done') : t('action.done')}</span>
    </button>
  );
}

/** Where focus goes when editing ends from inside the editor: the layer's timeline item, else Add text. */
function focusAfter(id: string, kept: boolean): void {
  const item = kept ? document.querySelector<HTMLElement>(`.tk-tclip[data-text-id="${CSS.escape(id)}"]`) : null;
  (item ?? document.querySelector<HTMLElement>('.tk-tool[data-action="add-text"]'))?.focus();
}

function NarrowBar({ count, root }: { readonly count: number; readonly root: RefObject<HTMLDivElement> }) {
  const layer = editedLayer.value;
  const open = picker.value;
  const bar = useRef<HTMLDivElement>(null);
  // The preview shrinks above the bar (CMP-TextEditor "narrow, keyboard open": the text stays visible): the
  // editor's root gets the bar's height, which the stage keeps free (text.css).
  useLayoutEffect(() => {
    const el = bar.current;
    const editor = el?.closest<HTMLElement>('.tk-editor');
    if (!el || !editor) return undefined;
    let frame = 0;
    // Set on the next frame: changing the layout inside the observer's callback would loop.
    const sizes = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => editor.style.setProperty('--text-bar', `${Math.ceil(el.offsetHeight)}px`));
    });
    sizes.observe(el);
    // The on-screen keyboard covers the layout's bottom: the bar sits on it and the stage keeps it free.
    const stage = el.closest<HTMLElement>('.tk-stage') ?? editor;
    const stopKeyboard = watchKeyboard(stage, (cover) => editor.style.setProperty('--keyboard', `${cover}px`));
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      stopKeyboard();
      editor.style.removeProperty('--text-bar');
      editor.style.removeProperty('--keyboard');
    };
  }, [layer !== null]);
  if (!layer) return null;
  const toggle = (which: 'font' | 'colour' | 'style'): void => {
    picker.value = open === which ? null : which;
  };
  const back = (): void => root.current?.querySelector<HTMLTextAreaElement>(`#${FIELD_ID}`)?.focus();
  return (
    <div
      class="tk-texteditor__narrow"
      ref={bar}
      // A press on the bar's controls keeps focus in the text field (WebKit would move it to the page and end
      // editing); keyboard focus may still move into the bar, which stays inside the editor.
      onPointerDown={(e) => {
        if ((e.target as Element).closest('button')) e.preventDefault();
      }}
    >
      {open ? (
        <div class="tk-texteditor__picker" data-picker={open}>
          {open === 'font' ? (
            <OptionGroup
              id="tk-texteditor-face"
              label={t('text.typeface')}
              options={faceOptions()}
              value={layer.typeface}
              onChoose={(f) => {
                styleText(layer.id, { typeface: f });
                back();
              }}
              variant="tiles"
            />
          ) : open === 'colour' ? (
            <OptionGroup
              id="tk-texteditor-colour"
              label={t('text.colour')}
              options={colourOptions()}
              value={layer.colour}
              onChoose={(c) => {
                styleText(layer.id, { colour: c });
                back();
              }}
              variant="swatches"
            />
          ) : (
            <OptionGroup
              id="tk-texteditor-style"
              label={t('text.style')}
              options={styleOptions()}
              value={layer.style}
              onChoose={(s) => {
                styleText(layer.id, { style: s });
                back();
              }}
              variant="segments"
            />
          )}
        </div>
      ) : null}
      <div class="tk-texteditor__quick">
        <button
          type="button"
          class="tk-texteditor__quick-button"
          data-action="text-font"
          aria-label={t('text.typeface')}
          title={t('text.typeface')}
          aria-pressed={open === 'font' ? 'true' : 'false'}
          onClick={() => toggle('font')}
        >
          <Icon name="text" size={20} />
        </button>
        <button
          type="button"
          class="tk-texteditor__quick-button"
          data-action="text-colour"
          aria-label={t('text.colour')}
          title={t('text.colour')}
          aria-pressed={open === 'colour' ? 'true' : 'false'}
          onClick={() => toggle('colour')}
        >
          <span class="tk-texteditor__dot" data-value={layer.colour} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="tk-texteditor__quick-button tk-texteditor__quick-button--labelled"
          data-action="text-style"
          aria-pressed={open === 'style' ? 'true' : 'false'}
          onClick={() => toggle('style')}
        >
          <Icon name="text" size={16} />
          <span>{t('text.style')}</span>
        </button>
        <span class="tk-texteditor__count tk-texteditor__count--quick" aria-hidden="true">
          {t('text.count', { n: count })}
        </span>
      </div>
    </div>
  );
}

export function TextEditor({ stage }: { readonly stage: RefObject<HTMLElement> }) {
  const box = useCanvasBox(stage);
  const layer = editedLayer.value;
  const id = editingText.value;
  const field = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const composing = useRef<{ value: string; start: number; end: number } | null>(null);
  const [count, setCount] = useState(0);
  const latest = useRef<{
    commit: (value: string) => void;
    replace: (value: string, caret: number) => void;
    insert: (data: string) => boolean;
  } | null>(null);

  // Implements: RULE-11 / F-010.R6 on typing, and composition for Vietnamese input methods (ADR-0012 §4): nothing
  // half-composed is committed; the composed text is committed when composition ends, within the limit.
  useEffect(() => {
    const el = field.current;
    if (id === null || !el) return undefined;
    const onStart = (): void => {
      composing.current = { value: el.value, start: el.selectionStart, end: el.selectionEnd };
    };
    const onEnd = (e: CompositionEvent): void => {
      const before = composing.current;
      composing.current = null;
      const fns = latest.current;
      if (!fns) return;
      if (countOf(el.value) <= RULE_11.maxCharacters) return fns.commit(el.value);
      // Over the limit: only what fits of the composed text is kept, never splitting a character.
      const r = before ? insertWithin(before.value, before.start, before.end, e.data ?? '') : null;
      if (r) fns.replace(r.value, r.caret);
      else if (before) fns.replace(before.value, before.start);
    };
    const onBefore = (e: InputEvent): void => {
      if (e.isComposing || composing.current) return;
      const data = e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph' ? '\n' : (e.data ?? null);
      if (data === null || !e.inputType.startsWith('insert')) return;
      const room =
        RULE_11.maxCharacters - countOf(el.value.slice(0, el.selectionStart) + el.value.slice(el.selectionEnd));
      if (countOf(data) <= room && data.normalize('NFC') === data) return;
      // Over the limit (or not composed): only what fits is inserted, in NFC.
      e.preventDefault();
      latest.current?.insert(data);
    };
    el.addEventListener('compositionstart', onStart);
    el.addEventListener('compositionend', onEnd);
    el.addEventListener('beforeinput', onBefore);
    registerEditor({
      // Done or focus leaving mid-composition: the word being composed is committed (NFC, within the limit).
      flush: () => {
        composing.current = null;
        latest.current?.commit(el.value);
      },
      // A cut that keeps the layer (undo, an outside edit): the field shows the layer's text as it now is.
      resync: () => {
        if (composing.current) return;
        const now = project.peek().textLayers.find((x) => x.id === id)?.content ?? '';
        if (el.value.normalize('NFC') === now) return;
        el.value = now;
        el.setSelectionRange(now.length, now.length);
        setCount(countOf(now));
      },
    });
    return () => {
      registerEditor(null);
      el.removeEventListener('compositionstart', onStart);
      el.removeEventListener('compositionend', onEnd);
      el.removeEventListener('beforeinput', onBefore);
    };
  }, [id]);

  // Focus moves into the field when a session opens; the field starts with the layer's text.
  useLayoutEffect(() => {
    const el = field.current;
    if (id === null || !el) return;
    const content = project.peek().textLayers.find((x) => x.id === id)?.content ?? '';
    el.value = content;
    setCount(countOf(content));
    el.focus({ preventScroll: true });
    el.setSelectionRange(content.length, content.length);
    picker.value = null;
    // Editing pauses playback, so the layer being typed stays on screen.
    playback.peek()?.ctl.pause();
  }, [id]);

  // RULE-20: Esc on the editor's own controls (Done, the narrow bar) finishes editing too.
  useEffect(() => {
    const el = root.current;
    if (id === null || !el) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && e.target !== field.current && !e.defaultPrevented) {
        e.preventDefault();
        finishEditing();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [id]);

  // After editing ends from inside the editor, focus goes to the layer's timeline item (or Add text).
  useEffect(() => {
    onEditingClosed((closed, kept) => {
      const inside = root.current?.contains(document.activeElement) ?? false;
      const onTop = document.activeElement?.closest('.tk-tool--done') !== null;
      if (inside || onTop || document.activeElement === document.body) setTimeout(() => focusAfter(closed, kept), 0);
    });
    return () => onEditingClosed(null);
  }, []);

  if (id === null) return null;

  const commit = (value: string): void => {
    const nfc = clampText(value);
    typeText(nfc);
    setCount(countOf(nfc));
  };
  /** Puts `value` in the field with the caret at `caret` (after a shortened insert) and commits it. */
  const replace = (value: string, caret: number): void => {
    const el = field.current;
    if (!el) return;
    el.value = value;
    el.setSelectionRange(caret, caret);
    commit(value);
  };
  /**
   * Inserts what fits of `data` at the selection (NFC, whole characters); false when nothing fits. Inserted as
   * typing is (`insertText`), so the field's own undo keeps working; where that is not available, set directly.
   */
  const insert = (data: string): boolean => {
    const el = field.current;
    if (!el) return false;
    const r = insertWithin(el.value, el.selectionStart, el.selectionEnd, data);
    if (!r) {
      setCount(RULE_11.maxCharacters);
      return false;
    }
    const head = el.value.slice(0, el.selectionStart);
    const room = RULE_11.maxCharacters - countOf(head + el.value.slice(el.selectionEnd));
    const piece = clampText(data, room);
    // The inserted piece fits and is NFC, so the beforeinput check lets it through as typing.
    if (piece && document.execCommand?.('insertText', false, piece)) return true;
    replace(r.value, r.caret);
    return true;
  };

  // Composition and beforeinput are listened to directly: Preact maps only the `on…` handlers the element
  // has as properties, and `oncompositionend` / `onbeforeinput` are not (in every engine): the effect above.
  latest.current = { commit, replace, insert };

  const layout = layer && box ? layoutText(layer, box.width, box.height, canvasMeasure()) : null;
  const atLimit = count >= RULE_11.maxCharacters;
  const near = RULE_11.maxCharacters - count <= ANNOUNCE_WITHIN;
  const cx = layer && box ? box.left + layer.x * box.width : 0;
  const cy = layer && box ? box.top + layer.y * box.height : 0;
  const fieldWidth = layout ? Math.max(layout.textWidth, layout.px * 0.5) + CARET_SLACK : 0;
  const fieldHeight = layout ? Math.max(1, layout.lines.length) * layout.lineHeight : 0;
  const wrap = box ? RULE_11.wrapWidth * box.width : 0;
  // INV-07: past the project end (an empty main track) the preview draws no text: the field shows its own
  // letters then, in the layer's colour, so typing is never blind.
  const p = project.value;
  const k = frameIndexAt(playhead.value, p.frame.frameRate);
  const drawn =
    layer !== null &&
    k < projectFrames(p) &&
    frameIndexAt(layer.start, p.frame.frameRate) <= k &&
    k < frameIndexAt(layer.end, p.frame.frameRate);

  return (
    <div
      ref={root}
      class="tk-texteditor"
      data-text-id={id}
      lang={language.value}
      onFocusOut={(e) => {
        // Editing ends when focus leaves the editor (not for its own controls, nor the window losing focus).
        const to = e.relatedTarget as Node | null;
        if (to && (root.current?.contains(to) || (to as Element).closest?.('.tk-tool--done'))) return;
        setTimeout(() => {
          if (!document.hasFocus()) return;
          const now = document.activeElement;
          if (now && (root.current?.contains(now) || now.closest('.tk-tool--done'))) return;
          if (editingText.peek() === id) finishEditing();
        }, 0);
      }}
    >
      {box ? (
        <>
          <div class="tk-texteditor__bar" style={{ left: `${box.left + box.width / 2}px`, top: `${box.top}px` }}>
            <span class="tk-texteditor__count" data-limit={atLimit ? '' : undefined}>
              {t('text.count', { n: count })}
            </span>
            <DoneButton variant="bar" />
          </div>
          <span
            class="tk-texteditor__guide"
            aria-hidden="true"
            style={{ left: `${Math.max(box.left, cx - wrap / 2)}px`, top: `${box.top}px`, height: `${box.height}px` }}
          />
          <span
            class="tk-texteditor__guide"
            aria-hidden="true"
            style={{
              left: `${Math.min(box.left + box.width, cx + wrap / 2)}px`,
              top: `${box.top}px`,
              height: `${box.height}px`,
            }}
          />
          <p class="tk-texteditor__hint" style={{ top: `${box.top + box.height}px` }}>
            {t('text.finish_hint')}
          </p>
        </>
      ) : null}
      <textarea
        ref={field}
        id={FIELD_ID}
        class="tk-texteditor__field"
        aria-label={t('text.field')}
        lang={layer ? langOf(layer.content) : undefined}
        rows={1}
        spellcheck={false}
        autoComplete="off"
        data-align={layer?.align}
        style={
          layout && box && layer
            ? {
                left: `${cx - fieldWidth / 2}px`,
                top: `${cy - fieldHeight / 2}px`,
                width: `${fieldWidth}px`,
                height: `${fieldHeight}px`,
                font: layout.font,
                lineHeight: String(LINE_HEIGHT),
                textAlign: layer.align === 'centre' ? 'center' : layer.align,
                // The canvas draws the glyphs (the field's own are transparent); the caret contrasts with them.
                caretColor: contrastOf(layer.colour) === 'black' ? 'white' : 'black',
                ...(drawn ? {} : { color: PALETTE_HEX[layer.colour] }),
              }
            : { left: '0px', top: '0px', width: '1px', height: '1px' }
        }
        onKeyDown={(e) => {
          // RULE-20: mid-composition the keys belong to the input method; otherwise Esc or Mod+Enter finish.
          if (e.isComposing || composing.current) return;
          if (e.key === 'Escape' || (e.key === 'Enter' && modDown(e))) {
            e.preventDefault();
            e.stopPropagation();
            finishEditing();
          }
        }}
        onPaste={(e) => {
          const raw = e.clipboardData?.getData('text/plain');
          if (raw === undefined) return;
          const data = raw.replace(/\r\n?/g, '\n');
          const el = e.currentTarget;
          const room =
            RULE_11.maxCharacters - countOf(el.value.slice(0, el.selectionStart) + el.value.slice(el.selectionEnd));
          // A paste that fits and is already composed goes through natively (the field's undo keeps it).
          if (data === raw && countOf(data) <= room && data.normalize('NFC') === data) return;
          e.preventDefault();
          insert(data);
        }}
        onInput={(e) => {
          if ((e as unknown as InputEvent).isComposing || composing.current) return;
          const el = e.currentTarget;
          if (countOf(el.value) > RULE_11.maxCharacters) {
            // A change the checks above did not see (drag and drop, autocorrect): kept within the limit.
            const caret = el.selectionStart;
            const kept = Array.from(
              new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(el.value.normalize('NFC')),
            )
              .slice(0, RULE_11.maxCharacters)
              .map((x) => x.segment)
              .join('');
            return replace(kept, Math.min(caret, kept.length));
          }
          commit(el.value);
        }}
      />
      {atLimit ? (
        <p class="tk-texteditor__limit" role="alert">
          <Icon name="error" size={16} />
          {t('text.char_limit')}
        </p>
      ) : null}
      <p class="tk-texteditor__status" role="status">
        {near ? t('text.count', { n: count }) : ''}
      </p>
      <NarrowBar count={count} root={root} />
    </div>
  );
}
