import { useEffect, useRef } from 'react'
import { t } from '../i18n'
import { shortTypeName, heliRole, CLOSE_RANGE_KM } from '../lib/notifyText'
import { countryCodeFromHex } from '../lib/countries'

const ALERT_AUTO_HIDE_MS = 5000

// Komunikaty o maszynach w zasięgu — do trzech naraz, znikają gdy maszyna
// wyleci z zasięgu albo gdy użytkownik je odrzuci.
export default function AlertStack({ alerts, onDismiss }) {
  // Komunikat o maszynie w zasięgu to TYLKO informacja (decyzja użytkownika):
  // znika po pięciu sekundach albo od razu po kliknięciu, a maszynę użytkownik
  // znajduje na mapie sam. Wcześniej klik zaznaczał maszynę i otwierał kartę.
  const alertTimersRef = useRef(new Map())
  useEffect(() => {
    const timers = alertTimersRef.current
    for (const a of alerts) {
      if (timers.has(a.hex)) continue
      timers.set(a.hex, setTimeout(() => {
        timers.delete(a.hex)
        onDismiss(a.hex)
      }, ALERT_AUTO_HIDE_MS))
    }
    // Sprzątanie po komunikatach, które zniknęły wcześniej (klik, wylot z zasięgu).
    const live = new Set(alerts.map(a => a.hex))
    for (const [hex, id] of timers) {
      if (!live.has(hex)) { clearTimeout(id); timers.delete(hex) }
    }
  }, [alerts, onDismiss])

  useEffect(() => {
    const timers = alertTimersRef.current
    return () => { for (const id of timers.values()) clearTimeout(id); timers.clear() }
  }, [])

  if (!alerts.length) return null
  return (
    <div className="alert-stack">
      {alerts.slice(0, 3).map(({ hex, ac, dist }) => {
        // Czerwień zostaje dla przypadku, który powiadomienie nazywa
        // „blisko Ciebie": maszyna wojskowa bliżej niż CLOSE_RANGE_KM.
        // Reszta dostaje kolor kategorii, zgodny z mapą.
        const isNear = (ac.kind || 'mil') === 'mil' && dist <= CLOSE_RANGE_KM
        return (
          <div key={hex}
            className={`alert-toast kind-${ac.kind || 'mil'}${isNear ? ' near' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onDismiss(hex)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDismiss(hex) }
            }}>
            <div className="alert-toast-body">
              <span className="alert-toast-tag">
                <span className="alert-toast-dot" />
                {/* Nagłówek mówi, DLACZEGO widzisz komunikat (w zasięgu /
                    blisko), a nie co to za maszyna — nazwa jest niżej.
                    Kategorię niesie kolor kropki i ramki. */}
                {isNear ? t('ALERT_TAG_NEAR') : t('ALERT_TAG')}
              </span>
              {/* Nazwa maszyny (albo służby) zamiast znaku wywoławczego —
                  tak samo jak w powiadomieniu systemowym. Znak wywoławczy
                  jest na karcie, po kliknięciu maszyny na mapie. */}
              <span className="alert-toast-call">
                {/* Skrót kraju z adresu ICAO przed nazwą — tak samo jak
                    w powiadomieniu systemowym. */}
                {[countryCodeFromHex(ac.hex), heliRole(ac) || shortTypeName(ac) || (ac.t || '').trim() || '?']
                  .filter(Boolean).join(' ')}
              </span>
              <span className="alert-toast-detail">{Math.round(dist)} km</span>
            </div>
            <button className="alert-toast-close"
              aria-label={t('DISMISS_NOTIFICATION')}
              onClick={e => { e.stopPropagation(); onDismiss(hex) }}>✕</button>
          </div>
        )
      })}
      {alerts.length > 3 && (
        <div className="alert-toast-overflow">+{alerts.length - 3} {t('ALERT_OVERFLOW')}</div>
      )}
    </div>
  )
}
