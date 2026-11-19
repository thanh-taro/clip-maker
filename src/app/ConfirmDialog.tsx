// MOD-App — CMP-ConfirmDialog (specs/30-experience/components/CMP-ConfirmDialog.md; board CMP-ConfirmDialog
// "default · wide", "focus on confirm · wide", "narrow", "default · vi-VN"). Asks before New project when there
// are unexported changes (F-018.AC3). A native modal <dialog> as CMP-ExportProgress is: the editor behind is
// inert, focus is trapped inside and starts on Cancel (the safe choice). Cancel, Esc or a click on the scrim
// close it and change nothing; COPY-action.new_project starts the new project (RULE-23). Narrow layouts show
// it as a bottom sheet with a grab handle and stacked touch-size actions (confirm.css).
// Implements: F-018.R2, F-018.AC3, CMP-ConfirmDialog "Variants & states", "Behavior" and "Accessibility".
import { useEffect, useRef } from 'preact/hooks';
import { language, t } from '../copy';
import { cancelNewProject, confirmNewProject, confirmOpen, takeOpener } from './new-project';

const TEXT_ID = 'tk-confirm-text';

export function ConfirmDialog() {
  const open = confirmOpen.value;
  void language.value;
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!open || !d) return undefined;
    if (!d.open) d.showModal();
    cancel.current?.focus();
    // A click on the scrim lands on the dialog element itself (its content fills the box): Cancel.
    const onScrim = (e: MouseEvent): void => {
      if (e.target === d) cancelNewProject();
    };
    d.addEventListener('click', onScrim);
    return () => {
      d.removeEventListener('click', onScrim);
      if (d.open) d.close();
      // Focus returns to the opener (CMP-ConfirmDialog "Accessibility"): New project, or More on narrow.
      const back = takeOpener();
      if (back?.isConnected) back.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      class="tk-confirm"
      role="alertdialog"
      aria-label={t('action.new_project')}
      aria-describedby={TEXT_ID}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        cancelNewProject();
      }}
      onCancel={(e) => {
        // Esc: the dialog's state is ours, so the signal closes it.
        e.preventDefault();
        cancelNewProject();
      }}
      onClose={() => {
        // The browser closed it by itself (a close request it no longer lets the page refuse): Cancel.
        if (confirmOpen.peek()) cancelNewProject();
      }}
    >
      <div class="tk-confirm__body">
        <span class="tk-confirm__grab" aria-hidden="true" />
        <p id={TEXT_ID} class="tk-confirm__text" data-copy="confirm.new_project">
          {t('confirm.new_project')}
        </p>
        <div class="tk-confirm__actions">
          <button
            ref={cancel}
            type="button"
            class="tk-confirm__button"
            data-action="cancel-new-project"
            data-copy="action.cancel"
            onClick={cancelNewProject}
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            class="tk-confirm__button tk-confirm__button--danger"
            data-action="confirm-new-project"
            data-copy="action.new_project"
            onClick={confirmNewProject}
          >
            {t('action.new_project')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
