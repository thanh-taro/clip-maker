// MOD-App — CMP-EmptyState (specs/30-experience/components/CMP-EmptyState.md): fills the preview area
// while the project is empty (SCR-Editor "empty"). Phase 3.3 skeleton: content and labels; the picker,
// drop and paste come with F-001.
import { t } from '../copy';
import { acceptsMedia } from './device';
import { Icon } from './icons';

export function EmptyState({ addRef }: { addRef: (el: HTMLButtonElement | null) => void }) {
  return (
    <div class="tk-empty">
      <div class="tk-empty__icons">
        <Icon name="video" size={20} />
        <Icon name="photo" size={20} />
        <Icon name="music" size={20} />
      </div>
      <h1 class="tk-empty__title">{t('empty.title')}</h1>
      <button
        type="button"
        class="tk-button tk-button--outlined"
        data-action="add-media"
        aria-disabled={acceptsMedia.value ? undefined : 'true'}
        ref={addRef}
      >
        <Icon name="addMedia" size={16} />
        {t('action.add_media')}
      </button>
      <p class="tk-empty__hint">{t('empty.drop_hint')}</p>
      <p class="tk-empty__privacy">
        <Icon name="shield" size={16} />
        {t('privacy.badge')}
      </p>
    </div>
  );
}
