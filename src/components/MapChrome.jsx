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

// Dzwonek z kropką stanu: zielona = alerty działają, bursztynowa = tylko
// w aplikacji (push wyłączony), czerwona = brak GPS. Bez niej stan alertów
// dało się sprawdzić dopiero po otwarciu panelu.
function IconBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
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
      <IconAppMark />
    </div>
  )
}

// Ta sama grafika co ikona aplikacji (public/radar-icon.svg): łuk zasięgu
// i sylwetka C-17, bez tła. Kolor z currentColor, żeby stan błędu nadal
// barwił znacznik na czerwono.
function IconAppMark() {
  return (
    <svg width="32" height="32" viewBox="40 40 432 432" aria-hidden="true">
      <path d="M76 256 A 180 180 0 0 1 256 76" fill="none" stroke="currentColor"
        strokeOpacity="0.4" strokeWidth="12" strokeLinecap="round"
        transform="rotate(-10 256 256)" />
      <g transform="translate(272 272) rotate(38) scale(11.4) translate(-16.0 -16.0)">
        <path fill="currentColor" d="M16.21 5.17l.19.19.26.56.34.83.19.48.22.83.11.82v1.16l.19.3.11.3.08.45v.45l1.16.67-.08-.52h-.11l-.04-.04-.07-.38v-.78l.04-.38h-.15v-.1l.07-.2.11-.1.04-.08h.9l.02.07.13.11.07.2v.1h-.15l.04.38v.78l-.07.38-.04.04h-.11l-.12.74 2.36 1.39-.07-.67h-.12l-.03-.04-.08-.38v-.78l.04-.38h-.15v-.1l.08-.2.1-.1.04-.08h.9l.04.07.11.11.08.2v.1h-.15l.04.38v.78l-.08.38-.04.04h-.1l-.16.93 4.57 2.62.11.08.07.15v.22l.34.79v.33l-.52-.4-3.86-.83-.07.19-.11.03V17l-1.35-.3-.11.23-.12.03v-.33l-.9-.19-.03.22-.11.2-.12.03v-.52l-1.42-.3-.04.22-.1.19-.12.03V16l-.56-.15-.08.49-.11.4-.19.38v2.92l-.07 1.46-.3 1.43-.34 1.16-.22.56L20.22 27l.15.15.03.15v.74l-4.26-1-.11.82-.12-.83-4.26 1.01v-.74l.03-.15.15-.15 3.63-2.36-.22-.56-.34-1.16-.3-1.43-.07-1.46v-2.92l-.19-.37-.11-.41-.08-.49-.56.15v.52l-.11-.03-.11-.19-.04-.22-1.42.3v.52l-.11-.04-.12-.19-.03-.22-.9.19v.33l-.11-.03-.12-.23-1.34.3v.26l-.12-.03-.07-.2-3.86.83-.52.41v-.33l.34-.79v-.22l.07-.15.11-.08 4.57-2.62-.15-.93h-.11l-.04-.04-.07-.38v-.78l.03-.38h-.15v-.1l.08-.2.11-.1.04-.08h.9l.03.07.12.11.07.2v.1h-.15l.04.38v.78l-.08.38-.03.04h-.12l-.07.67 2.36-1.39-.12-.74h-.1l-.05-.04-.07-.38v-.78l.04-.38h-.15v-.1l.07-.2.11-.1.04-.08h.9l.04.07.11.11.08.2v.1h-.15l.03.38v.78l-.07.38-.04.04h-.11l-.08.52 1.16-.67v-.45l.08-.45.11-.3.19-.3V8.88l.11-.82.22-.83.2-.48.33-.83.26-.56.19-.19.19-.07z" />
      </g>
    </svg>
  )
}

// Celownik — powrót do widoku startowego. Bez niego odjechanie mapą było
// jednokierunkowe: zoomControl jest wyłączony, więc jedynym sposobem na powrót
// nad Polskę było przeładowanie aplikacji.
function IconCrosshair() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Kolejność od góry: Mapa, Alerty, Ustawienia, GPS. Najczęściej używany
// (GPS) najniżej — najbliżej kciuka na telefonie.
export function MapPanelButtons({ activePanel, onTogglePanel, onRecenter, hasGps, alertsLevel }) {
  const panelBtn = (id, label, icon, extra = null) => (
    <button
      className={`icon-btn ${activePanel === id ? 'active' : ''}`}
      aria-expanded={activePanel === id}
      aria-label={label}
      title={label}
      onClick={() => onTogglePanel(id)}>
      {icon}
      {extra}
    </button>
  )

  return (
    <div className="map-ctrl-btns">
      {panelBtn('mapy', t('NAV_MAPS_A11Y'), <IconLayers />)}
      {panelBtn('alerty', t('NAV_ALERTS_A11Y'), <IconBell />,
        <span className={`icon-btn__dot icon-btn__dot--${alertsLevel}`} aria-hidden="true" />)}
      {panelBtn('ustawienia', t('NAV_SETTINGS_A11Y'), <IconSliders />)}
      <button
        className={`icon-btn ${hasGps ? 'has-gps' : 'no-gps'}`}
        aria-label={hasGps ? t('NAV_RECENTER_GPS_A11Y') : t('NAV_RECENTER_PL_A11Y')}
        title={hasGps ? t('NAV_RECENTER_GPS_A11Y') : t('NAV_RECENTER_PL_A11Y')}
        onClick={onRecenter}>
        <IconCrosshair />
      </button>
    </div>
  )
}
