// MOD-App — SCR-Unsupported (specs/30-experience/screens/SCR-Unsupported.md): shown when the RULE-22
// start-up check fails; no media can be added (F-023.R1). The bar shows only the badge and the link.
import { language, t } from '../copy';
import type { Missing } from '../codec';
import { StatusBar } from './StatusBar';

const ITEM = {
  decode: 'unsupported.missing_decode',
  encode: 'unsupported.missing_encode',
  effects: 'unsupported.missing_effects',
} as const;

export function Unsupported({
  missing,
  headingRef,
}: {
  missing: readonly Missing[];
  headingRef: (el: HTMLHeadingElement | null) => void;
}) {
  const list = new Intl.ListFormat(language.value, { type: 'conjunction' }).format(missing.map((m) => t(ITEM[m])));
  return (
    <div class="tk-editor tk-editor--unsupported" data-screen="SCR-Unsupported" data-state="default">
      <main class="tk-unsupported">
        <h1 class="tk-unsupported__title" tabIndex={-1} ref={headingRef}>
          {t('unsupported.title')}
        </h1>
        <p>{t('unsupported.body', { missing: list })}</p>
      </main>
      <StatusBar />
    </div>
  );
}
