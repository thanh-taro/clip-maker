// MOD-App — CMP-ShortcutHelp (specs/30-experience/components/CMP-ShortcutHelp.md; board CMP-ShortcutHelp "wide
// dialog · mac", "other systems", "narrow sheet"). Lists RULE-20 in the active language, from MOD-Keys'
// HELP_GROUPS (the list is the key map). A native modal <dialog> as CMP-ConfirmDialog is: the editor behind is
// inert and only Esc acts (RULE-20); focus starts on the close button and returns to the opener. Wide layouts
// show three columns; narrow ones a bottom sheet with a grab handle and one scrolling column (shortcuts.css).
// Implements: F-017.R3, F-017.AC4, CMP-ShortcutHelp "Variants & states", "Behavior" and "Accessibility".
import { useEffect, useRef } from 'preact/hooks';
import { language, t, type MessageId, type MessageParams } from '../copy';
import { HELP_GROUPS, isMac, keyCaps, type HelpGroup, type HelpRow } from '../keys';
import { Icon } from './icons';
import { closeHelp, helpOpen, takeHelpOpener } from './shortcuts';

const TITLE_ID = 'tk-help-title';

/** A COPY ID without parameters: what MOD-Keys' list labels are (tests/unit/keys.map.test.ts checks each). */
type Plain = { [K in MessageId]: MessageParams[K] extends undefined ? K : never }[MessageId];
const label = (id: string): string => t(id as Plain);

export function ShortcutHelp() {
  const open = helpOpen.value;
  void language.value;
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!open || !d) return undefined;
    if (!d.open) d.showModal();
    close.current?.focus();
    // A press and click on the scrim (the dialog element itself; its content fills it) closes it, as Esc does.
    let pressedOnScrim = false;
    const onPress = (e: PointerEvent): void => {
      pressedOnScrim = e.target === d;
    };
    const onScrim = (e: MouseEvent): void => {
      if (pressedOnScrim && e.target === d) closeHelp();
      pressedOnScrim = false;
    };
    d.addEventListener('pointerdown', onPress);
    d.addEventListener('click', onScrim);
    return () => {
      d.removeEventListener('pointerdown', onPress);
      d.removeEventListener('click', onScrim);
      if (d.open) d.close();
      const back = takeHelpOpener();
      if (back?.isConnected) back.focus();
    };
  }, [open]);
  if (!open) return null;
  const mac = isMac(navigator.platform || navigator.userAgent);
  const column = (n: 1 | 2 | 3) => (
    <div class="tk-help__column">
      {HELP_GROUPS.filter((g) => g.column === n).map((g) => (
        <Group key={g.title} group={g} mac={mac} />
      ))}
    </div>
  );
  return (
    <dialog
      ref={dialog}
      class="tk-help"
      aria-labelledby={TITLE_ID}
      data-mac={mac ? '' : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        closeHelp();
      }}
      onCancel={(e) => {
        e.preventDefault();
        closeHelp();
      }}
      onClose={() => {
        if (helpOpen.peek()) closeHelp();
      }}
    >
      {/* One element fills the dialog, so only the real scrim (the dialog element) counts as a press outside. */}
      <div class="tk-help__inner">
        <span class="tk-help__grab" aria-hidden="true" />
        <div class="tk-help__head">
          <h2 id={TITLE_ID} class="tk-help__title" data-copy="help.title">
            {t('help.title')}
          </h2>
          <button
            ref={close}
            type="button"
            class="tk-icon-button tk-help__close"
            aria-label={t('action.close')}
            title={t('action.close')}
            data-copy="action.close"
            onClick={closeHelp}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {/* NFR-06: the list scrolls inside the dialog and is reachable by keyboard (axe scrollable-region-focusable). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div class="tk-help__body" role="region" aria-labelledby={TITLE_ID} tabIndex={0}>
          {column(1)}
          {column(2)}
          {column(3)}
        </div>
        <p class="tk-help__scope" data-copy="help.scope">
          {t('help.scope')}
        </p>
      </div>
    </dialog>
  );
}

/** A group: a heading followed by a description list, so the action is read before its keys. */
function Group({ group, mac }: { group: HelpGroup; mac: boolean }) {
  const id = `tk-help-${group.title.replace('.', '-')}`;
  return (
    <section class="tk-help__group" aria-labelledby={id}>
      <h3 id={id} class="tk-help__heading" data-copy={group.title}>
        {label(group.title)}
      </h3>
      <dl class="tk-help__list">
        {group.rows.map((row) => (
          <Row key={row.label} row={row} mac={mac} />
        ))}
      </dl>
    </section>
  );
}

function Row({ row, mac }: { row: HelpRow; mac: boolean }) {
  return (
    <div class="tk-help__row" data-row={row.label}>
      <dt class="tk-help__label" data-copy={row.label}>
        {label(row.label)}
      </dt>
      <dd class="tk-help__keys">
        {row.hold ? (
          <span class="tk-help__hold" data-copy="help.hold">
            {t('help.hold')}
          </span>
        ) : null}
        {row.keys.map((combo, i) => (
          <span key={i} class="tk-help__combo">
            {i > 0 ? <span class="tk-help__or">/</span> : null}
            {keyCaps(combo, mac).map((cap, j) =>
              cap.name ? (
                <kbd key={j} class="tk-help__key">
                  <span aria-hidden="true">{cap.text}</span>
                  <span class="tk-help__sr">{cap.name}</span>
                </kbd>
              ) : (
                <kbd key={j} class="tk-help__key">
                  {cap.text}
                </kbd>
              ),
            )}
          </span>
        ))}
      </dd>
    </div>
  );
}
