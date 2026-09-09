import { t } from '../i18n'

// Chrome nad mapą: znacznik aplikacji w lewym górnym rogu i dwa wejścia do
// paneli w prawym. Zastąpił pasek na całą szerokość — ten zjadał pas ekranu na
// nazwę i zegar, a mapa jest tu treścią. Stan (ładowanie, błąd, czas ostatniego
// odświeżenia) niesie teraz sam znacznik: kolorem, pulsem i podpowiedzią.
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

export function MapMark({ isLoading, error, lastUpdated }) {
  const state = error ? 'err' : isLoading ? 'busy' : 'ok'
  const title = error
    ? error
    : lastUpdated
      ? `${t('REFRESHED_AT')} ${lastUpdated}`
      : t('APP_TITLE')
  return (
    <div className={`map-mark map-mark--${state}`} title={title} role="status" aria-label={title}>
      ◎
    </div>
  )
}

export function MapPanelButtons({ activePanel, onTogglePanel }) {
  return (
    <div className="map-ctrl-btns">
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
  )
}
