// MOD-App — SCR-Unsupported (specs/30-experience/screens/SCR-Unsupported.md, boards
// SCR-Unsupported_wide / _narrow): shown when the RULE-22 start-up check fails. The message names
// each failed check (COPY-unsupported.missing_*) inside COPY-unsupported.body and suggests a supported
// browser; there is no way to add media here (F-023.R1). The status bar stays (privacy badge, source).
import './styles/device.css';
import { language, t } from '../copy';
import type { Missing } from '../codec';
import { unsupportedBody } from './device';
import { Icon } from './icons';
import { StatusBar } from './StatusBar';

export function Unsupported({
  missing,
  headingRef,
}: {
  missing: readonly Missing[];
  headingRef: (el: HTMLHeadingElement | null) => void;
}) {
  const body = unsupportedBody(missing, language.value);
  return (
    <div class="tk-editor tk-editor--unsupported" data-screen="SCR-Unsupported" data-state="default">
      <main class="tk-unsupported">
        <section class="tk-unsupported__message" aria-labelledby="tk-unsupported-title">
          <span class="tk-unsupported__badge">
            <Icon name="monitorX" size={32} />
          </span>
          <h1 id="tk-unsupported-title" class="tk-unsupported__title" tabIndex={-1} ref={headingRef}>
            {t('unsupported.title')}
          </h1>
          <div class="tk-unsupported__body" data-copy="unsupported.body">
            <p>{body.before}</p>
            <ul class="tk-unsupported__missing">
              {missing.map((m, i) => (
                <li key={m} data-missing={m}>
                  <Icon name="close" size={16} class="tk-unsupported__x" />
                  {body.items[i]}
                </li>
              ))}
            </ul>
            <p class="tk-unsupported__hint">{body.after}</p>
          </div>
        </section>
      </main>
      <StatusBar />
    </div>
  );
}
