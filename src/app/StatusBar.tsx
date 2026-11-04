// MOD-App — CMP-StatusBar (specs/30-experience/components/CMP-StatusBar.md): the always-visible
// privacy badge (F-020.R1) and the source link (F-020.R3). Phase 3.3 skeleton: the badge and link in
// both languages; the privacy details popover and the in-tool notices view come with F-020, the
// project facts with F-002.
import { t } from '../copy';
import { Icon } from './icons';

/** F-020.AC3: the public source repository. */
export const SOURCE_URL = 'https://github.com/thanh-taro/clip-maker';

export function StatusBar() {
  return (
    <footer class="tk-status-bar">
      <button type="button" class="tk-privacy-badge" data-copy="privacy.badge">
        <Icon name="shield" size={16} class="tk-privacy-badge__icon" />
        <span class="tk-privacy-badge__text">{t('privacy.badge')}</span>
      </button>
      <a class="tk-source-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
        <span class="tk-source-link__text">{t('privacy.source_label')}</span>
        <Icon name="external" size={16} />
      </a>
    </footer>
  );
}
