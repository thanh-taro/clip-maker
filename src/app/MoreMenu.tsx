// MOD-App — CMP-Toolbar's More menu (specs/30-experience/components/CMP-Toolbar.md "narrow / More menu open";
// board CMP-Toolbar). On narrow layouts (D-038) New project, Keyboard shortcuts, Licences and credits and the
// source link live here. More is pressed while the menu is open; the menu closes on Esc, on choosing an item
// or on a tap outside it, and gives focus back to More. Arrow keys, Home and End move between the items.
// Built with F-018 because New project (F-018.R2) is only reachable from it on phones; Keyboard shortcuts
// opens CMP-ShortcutHelp once F-017 builds it (the wide toolbar's button is the same).
// Implements: F-018.R2 (narrow), CMP-Toolbar "Behavior" (More menu) and "Accessibility" (popup, expanded
// state, menu items), CMP-ConfirmDialog "Behavior" (opened from the More menu on narrow), F-020.R3/R4 (narrow).
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../copy';
import { Icon } from './icons';
import { requestNewProject } from './new-project';
import { noticesRequest, SOURCE_URL } from './StatusBar';

/** The More menu is open. */
export const moreOpen = signal(false);

const ITEM = '[role="menuitem"]';

export function MoreButton() {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = moreOpen.value;

  const close = (returnFocus: boolean): void => {
    moreOpen.value = false;
    if (returnFocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLElement>(ITEM)?.focus();
    const onPointer = (e: PointerEvent): void => {
      const target = e.target as Node | null;
      if (target && (menu.current?.contains(target) || button.current?.contains(target))) return;
      close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent): void => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number): void => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') close(false);
  };

  /** Choosing an item closes the menu first; focus goes back to More unless the item takes it elsewhere. */
  const choose = (run: () => void) => () => {
    close(true);
    run();
  };

  return (
    <div class="tk-more">
      <button
        ref={button}
        type="button"
        class="tk-tool tk-tool--more"
        data-action="more"
        aria-label={t('action.more')}
        title={t('action.more')}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? 'tk-more-menu' : undefined}
        onClick={() => (open ? close(true) : (moreOpen.value = true))}
      >
        <Icon name="more" size={20} />
      </button>
      {open ? (
        // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the menu's items take focus, not the menu
        <div
          ref={menu}
          id="tk-more-menu"
          class="tk-more__menu"
          role="menu"
          aria-label={t('action.more')}
          onKeyDown={onMenuKey}
        >
          <button
            type="button"
            class="tk-more__item"
            role="menuitem"
            data-action="new-project"
            data-copy="action.new_project"
            onClick={choose(() => void requestNewProject(button.current))}
          >
            <Icon name="newProject" size={20} />
            {t('action.new_project')}
          </button>
          <button
            type="button"
            class="tk-more__item"
            role="menuitem"
            data-action="shortcuts"
            data-copy="action.shortcuts"
            onClick={choose(() => undefined)}
          >
            <Icon name="shortcuts" size={20} />
            {t('action.shortcuts')}
          </button>
          <span class="tk-more__separator" role="separator" />
          <button
            type="button"
            class="tk-more__item"
            role="menuitem"
            data-action="notices"
            data-copy="privacy.notices"
            onClick={choose(() => noticesRequest.value++)}
          >
            <Icon name="info" size={20} />
            {t('privacy.notices')}
          </button>
          {/* F-020.R3: a new tab with no opener and no referrer. */}
          <a
            class="tk-more__item"
            role="menuitem"
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-copy="privacy.source_label"
            onClick={() => close(true)}
          >
            <Icon name="code" size={20} />
            {t('privacy.source_label')}
          </a>
        </div>
      ) : null}
    </div>
  );
}
