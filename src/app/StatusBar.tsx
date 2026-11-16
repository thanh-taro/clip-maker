// MOD-App — CMP-StatusBar (specs/30-experience/components/CMP-StatusBar.md): the always-visible
// privacy badge (F-020.R1), the privacy details popover (F-020.R2), the source link (F-020.R3) and the
// in-tool licence notices view (F-020.R4). The project facts (COPY-status.facts) come with F-002.
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../copy';
import { Icon } from './icons';
import { noticeSections } from './notices';

/** F-020.AC3: the public source repository. */
export const SOURCE_URL = 'https://github.com/thanh-taro/clip-maker';

/**
 * CMP-MusicPicker's link to COPY-privacy.notices opens the same in-tool notices view (F-020.R4); each
 * request bumps this counter. Closing the view returns focus to the badge.
 */
export const noticesRequest = signal(0);

/** What the status bar shows over the editor: nothing, the privacy details, or the notices view. */
type View = 'closed' | 'details' | 'notices';

export function StatusBar() {
  const [view, setView] = useState<View>('closed');
  const badge = useRef<HTMLButtonElement>(null);
  /** Where focus goes after the next render: back to the badge, into the details, or to their notices button. */
  const focusNext = useRef<'badge' | 'details' | 'notices-button' | null>(null);
  const details = useRef<HTMLElement>(null);
  const noticesButton = useRef<HTMLButtonElement>(null);

  const close = (returnFocus: boolean) => {
    focusNext.current = returnFocus ? 'badge' : null;
    setView('closed');
  };

  useLayoutEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target === 'badge') badge.current?.focus();
    else if (target === 'details') details.current?.focus();
    else if (target === 'notices-button') noticesButton.current?.focus();
  }, [view]);

  // Implements: F-020.AC2 — Esc or a click outside dismisses the details. One pair of listeners for the
  // bar's lifetime, reading the current view, so they are in place whenever the details show.
  const current = useRef<View>(view);
  current.current = view;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || current.current !== 'details') return;
      e.preventDefault();
      close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (current.current !== 'details') return;
      const target = e.target as Node | null;
      if (!target || details.current?.contains(target) || badge.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  const requested = noticesRequest.value;
  useEffect(() => {
    if (requested > 0) setView('notices');
  }, [requested]);

  const toggle = () => {
    focusNext.current = view === 'closed' ? 'details' : 'badge';
    setView(view === 'closed' ? 'details' : 'closed');
  };

  return (
    <footer class="tk-status-bar">
      {/* Implements: F-020.R1 — the statement is always visible and opens the details (F-020.R2). */}
      <button
        type="button"
        ref={badge}
        class="tk-privacy-badge"
        data-copy="privacy.badge"
        aria-haspopup="dialog"
        aria-expanded={view !== 'closed'}
        onClick={toggle}
      >
        <span class="tk-privacy-badge__dot" aria-hidden="true" />
        <Icon name="shield" size={16} class="tk-privacy-badge__icon" />
        <span class="tk-privacy-badge__text">{t('privacy.badge')}</span>
      </button>
      {/* Implements: F-020.R3 — a new tab with no opener and no referrer; nothing in this page changes.
          In a host frame without `allow-popups` the browser refuses the new tab and nothing happens. */}
      <a
        class="tk-source-link"
        href={SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-copy="privacy.source_label"
      >
        <span class="tk-source-link__text">{t('privacy.source_label')}</span>
        <Icon name="external" size={16} class="tk-source-link__external" />
        <Icon name="code" size={16} class="tk-source-link__code" />
      </a>
      {view === 'details' ? (
        <PrivacyDetails
          rootRef={details}
          noticesRef={noticesButton}
          onClose={() => close(true)}
          onNotices={() => setView('notices')}
        />
      ) : null}
      {view === 'notices' ? (
        <LicenceNotices
          onBack={() => {
            focusNext.current = 'notices-button';
            setView('details');
          }}
          onClose={() => close(true)}
        />
      ) : null}
    </footer>
  );
}

const DETAILS_HEADING = 'tk-privacy-details-heading';
const DETAILS_BODY = 'tk-privacy-details-body';

// Implements: F-020.R2 — what the tool does and does not do with media, including export scratch space.
function PrivacyDetails({
  rootRef,
  noticesRef,
  onClose,
  onNotices,
}: {
  rootRef: { current: HTMLElement | null };
  noticesRef: { current: HTMLButtonElement | null };
  onClose: () => void;
  onNotices: () => void;
}) {
  return (
    <section
      ref={rootRef}
      class="tk-privacy-details"
      role="dialog"
      aria-labelledby={DETAILS_HEADING}
      aria-describedby={DETAILS_BODY}
      tabIndex={-1}
    >
      <div class="tk-privacy-details__head">
        <Icon name="shield" size={16} class="tk-privacy-details__icon" />
        <h2 id={DETAILS_HEADING} class="tk-privacy-details__title" data-copy="privacy.badge">
          {t('privacy.badge')}
        </h2>
        <button
          type="button"
          class="tk-icon-button"
          aria-label={t('action.close')}
          title={t('action.close')}
          data-copy="action.close"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <p id={DETAILS_BODY} class="tk-privacy-details__body" data-copy="privacy.details">
        {t('privacy.details')}
      </p>
      <div class="tk-privacy-details__actions">
        <button
          type="button"
          ref={noticesRef}
          class="tk-button tk-button--outlined-accent"
          data-copy="privacy.notices"
          onClick={onNotices}
        >
          {t('privacy.notices')}
        </button>
      </div>
    </section>
  );
}

const NOTICES_HEADING = 'tk-notices-heading';

// Implements: F-020.R4 — the licence notices inside the tool: compiled into the page, so no request and
// no new tab. A modal dialog with real table headers; Esc and close end it, back returns to the details.
function LicenceNotices({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  /** Set when this view closes the dialog itself (unmounting for back or close), not the browser. */
  const unmounting = useRef(false);
  useLayoutEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      unmounting.current = true;
      if (el?.open) el.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      class="tk-notices"
      aria-labelledby={NOTICES_HEADING}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Any other way the dialog closes (e.g. the browser closing it) keeps the view state in sync.
      onClose={() => {
        if (!unmounting.current) onClose();
      }}
    >
      <div class="tk-notices__head">
        <button
          type="button"
          class="tk-icon-button"
          aria-label={t('action.back')}
          title={t('action.back')}
          data-copy="action.back"
          onClick={onBack}
        >
          <Icon name="back" size={16} />
        </button>
        <h2 id={NOTICES_HEADING} class="tk-notices__title" data-copy="privacy.notices_title">
          {t('privacy.notices_title')}
        </h2>
        <button
          type="button"
          class="tk-icon-button"
          aria-label={t('action.close')}
          title={t('action.close')}
          data-copy="action.close"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {/* NFR-06: the scrolling list is reachable by keyboard (focusable, named by the heading; axe
          scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div class="tk-notices__body" role="region" aria-labelledby={NOTICES_HEADING} tabIndex={0}>
        {noticeSections().map((section) => {
          const id = `tk-notices-${section.heading.replace('.', '-')}`;
          return (
            <section key={section.heading} class="tk-notices__section">
              <h3 id={id} class="tk-notices__heading" data-copy={section.heading}>
                {t(section.heading)}
              </h3>
              <table class="tk-notices__table" aria-labelledby={id}>
                <thead>
                  <tr>
                    <th scope="col" data-copy="notices.col_title">
                      {t('notices.col_title')}
                    </th>
                    <th scope="col" data-copy="notices.col_source">
                      {t('notices.col_source')}
                    </th>
                    <th scope="col" data-copy="notices.col_licence">
                      {t('notices.col_licence')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={`${row.title} ${row.source}`}>
                      <td>{row.title}</td>
                      <td class="tk-notices__source">{row.source}</td>
                      <td>{row.licence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {section.texts.map((n) => (
                <div key={n.title} class="tk-notices__text">
                  <p class="tk-notices__text-title">{n.title}</p>
                  <pre class="tk-notices__text-body">{n.text}</pre>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </dialog>
  );
}
