import { t } from '../i18n'

// Pasek górny. Zastąpił plakietkę z logo w rogu i dwa tekstowe przyciski:
// najlepsze miejsce na ekranie niesie teraz stan (świeżość danych, ładowanie,
// błąd), a wejścia do paneli są ikonami o pełnym polu dotyku.
function IconSliders() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 7h11M18 7h3M3 17h4M11 17h10" />
      <circle cx="16" cy="7" r="2.4" />
      <circle cx="9" cy="17" r="2.4" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 L21 8 L12 13 L3 8 Z" />
      <path d="M3 13 L12 18 L21 13" />
    </svg>
  )
}

export default function TopBar({ isLoading, error, lastUpdated, activePanel, onTogglePanel }) {
  return (
    <div className="topbar">
      <span className="topbar__mark">◎</span>
      <span className="topbar__name">{t('APP_TITLE_SHORT')}</span>
      <span className="topbar__sep" />
      {error && !isLoading
        ? <span className="topbar__err" title={error}>! {error}</span>
        : isLoading
          ? <span className="topbar__spin">◌</span>
          : lastUpdated
            ? <span className="topbar__ts">{t('REFRESHED_AT')} {lastUpdated}</span>
            : null}
      <span className="topbar__grow" />
      <div className="topbar__btns">
        <button
          className={`icon-btn ${activePanel === 'ustawienia' ? 'active' : ''}`}
          aria-expanded={activePanel === 'ustawienia'}
          aria-label={t('NAV_SETTINGS_A11Y')}
          title={t('NAV_SETTINGS_A11Y')}
          onClick={() => onTogglePanel('ustawienia')}>
          <IconSliders />
        </button>
        <button
          className={`icon-btn ${activePanel === 'mapy' ? 'active' : ''}`}
          aria-expanded={activePanel === 'mapy'}
          aria-label={t('NAV_MAPS_A11Y')}
          title={t('NAV_MAPS_A11Y')}
          onClick={() => onTogglePanel('mapy')}>
          <IconLayers />
        </button>
      </div>
    </div>
  )
}
