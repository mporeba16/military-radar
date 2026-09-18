import { useState, useEffect } from 'react'
import { altToColor, ftToM, knToKmh, countryFromHex, countryFlag } from './aircraftShapes'
import { typeLabel } from '../lib/typeNames'
import { findLikelyLanding } from '../airfields'
import { scorePhotoMatch, photoHasMatchSignal, canVerifyPhotoMatch } from '../lib/photoMatch'
import { t } from '../i18n'
import { formatFlightTime } from '../lib/flightTime'
import './AircraftInfoPanel.css'

// V4: ICAO special transponder codes that mean something serious
const SPECIAL_SQUAWKS = {
  '7500': { label: '🚨 7500 PORWANIE', kind: 'critical' },
  '7600': { label: '⚠ 7600 BRAK ŁĄCZNOŚCI', kind: 'warn' },
  '7700': { label: '🚨 7700 EMERGENCY', kind: 'critical' },
  '7400': { label: '⚠ 7400 UTRATA UAV', kind: 'warn' },
}

function useAircraftPhoto(hex, reg, ac) {
  const [photo, setPhoto] = useState(null)
  // 'idle' | 'loading' | 'ok' | 'not-found' | 'error'
  // 'not-found' = planespotters returned 0 photos (image genuinely missing)
  // 'error'     = network / timeout / bad response (try again later)
  const [state, setState] = useState('idle')
  useEffect(() => {
    if (!hex && !reg) return
    setPhoto(null)
    setState('loading')
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 6000)

    // Returns { ok, photos } so we can distinguish "no photos" (ok=true,
    // empty list) from "fetch broke" (ok=false).
    const fetchList = async (url) => {
      try {
        const r = await fetch(url, { signal: ctrl.signal })
        if (!r.ok) return { ok: false, photos: [] }
        const data = await r.json()
        return { ok: true, photos: data?.photos || [] }
      } catch (err) {
        if (err.name === 'AbortError') throw err
        return { ok: false, photos: [] }
      }
    }

    ;(async () => {
      try {
        // Fetch hex + reg in parallel. The REGISTRATION is the authoritative
        // identity of the current airframe; a hex can be stale in planespotters
        // (military hexes get reassigned), so we tag the source and put reg
        // photos first — scorePhotoMatch then gives them a tie-breaking bonus.
        const [hexRes, regRes] = await Promise.all([
          hex ? fetchList(`https://api.planespotters.net/pub/photos/hex/${hex}`) : Promise.resolve({ ok: true, photos: [] }),
          reg ? fetchList(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`) : Promise.resolve({ ok: true, photos: [] }),
        ])
        const anyOk = hexRes.ok || regRes.ok
        const results = [
          ...regRes.photos.map(p => ({ ...p, _src: 'reg' })),
          ...hexRes.photos.map(p => ({ ...p, _src: 'hex' })),
        ]

        const seen = new Set()
        const unique = results.filter(p => {
          if (!p?.id || seen.has(p.id)) return false
          seen.add(p.id)
          return true
        })
        if (!unique.length) {
          // Distinguish: at least one endpoint returned cleanly → genuinely
          // no photo. All requests broke → network/server error.
          setPhoto(null); setState(anyOk ? 'not-found' : 'error')
          return
        }

        unique.sort((a, b) => scorePhotoMatch(b, ac) - scorePhotoMatch(a, ac))
        const best = unique[0]
        // Zwycięzca bez ŻADNEGO sygnału identyfikującego (typ/operator) nie
        // trafia na kartę. Odrzucamy w dwóch sytuacjach:
        //
        //   kilku kandydatów — kolejność z API jest wtedy przypadkowa
        //     względem płatowca, więc wybór najwyżej punktowanego to zgadywanie;
        //   jeden kandydat, ale MAMY czym go zweryfikować — bo pojedyncze
        //     trafienie wcale nie znaczy trafne.
        //
        // Ten drugi przypadek był dziurą: polski C-130 „HEREC01" ma rejestrację
        // 1510, planespotters rozwija ją na niemiecki numer 15+10 i zwraca
        // JEDNO zdjęcie — Airbusa A321 Luftwaffe. Karta pokazywała je jako
        // zdjęcie polskiego Herculesa. Złe zdjęcie jest gorsze niż żadne:
        // brak informuje, że nie wiemy, a cudze wprowadza w błąd.
        if (!photoHasMatchSignal(best, ac) && (unique.length > 1 || canVerifyPhotoMatch(ac))) {
          setPhoto(null); setState('not-found')
          return
        }
        setPhoto(best)
        setState('ok')
      } catch (err) {
        if (err.name === 'AbortError') return
        setPhoto(null); setState('error')
      } finally {
        clearTimeout(timeout)
      }
    })()
    return () => { clearTimeout(timeout); ctrl.abort() }
  }, [hex, reg, ac.t, ac.flight])
  return { photo, state }
}

// Trend pionowy z prędkości wznoszenia (ft/min). Próg 250 ft/min odsiewa
// drgania barometru w locie poziomym.
const VS_THRESHOLD_FPM = 250
function verticalTrend(ac) {
  const rate = ac.baro_rate ?? ac.geom_rate
  if (rate == null || ac.alt_baro == null || ac.alt_baro === 'ground') return null
  if (rate > VS_THRESHOLD_FPM) return { dir: 'up', icon: '↑', label: t('INFO_CLIMBING') }
  if (rate < -VS_THRESHOLD_FPM) return { dir: 'down', icon: '↓', label: t('INFO_DESCENDING') }
  return { dir: 'level', icon: '→', label: t('INFO_LEVEL') }
}

export default function AircraftInfoPanel({ ac, flightStart, onClose }) {
  const { photo, state: photoState } = useAircraftPhoto(ac.hex, ac.reg, ac)
  const [imgError, setImgError] = useState(false)
  const altM = ftToM(ac.alt_baro)
  const kmh = knToKmh(ac.gs)
  const color = altToColor(altM)
  const label = typeLabel(ac.t)
  const country = ac.country || countryFromHex(ac.hex)
  const flag = country ? countryFlag(country) : ''
  const landing = findLikelyLanding(ac)
  const trend = altM != null ? verticalTrend(ac) : null
  const flightTime = formatFlightTime(flightStart)

  useEffect(() => { setImgError(false) }, [photo])

  // Karta mówi CZYM jest maszyna, nie gdzie dokładnie leci względem Ciebie.
  // Dystans, prędkość pionowa, czas na radarze i długość śladu zniknęły —
  // dystans niesie i tak alert, a resztę widać na mapie. Kraj też nie ma
  // własnego wiersza: mówi go flaga w nagłówku (nazwa została w podpowiedzi).
  //
  // Układ: dwie liczby, które NAPRAWDĘ się zmieniają (wysokość i prędkość),
  // dostają stopień pisma odpowiadający temu, jak często się na nie patrzy.
  // Czym maszyna jest, mówi nagłówek; operator zniknął, bo „NATO" czy „Siły
  // Powietrzne RP" i tak wynikało z flagi i znaku wywoławczego obok.

  const photoSrc = photo?.thumbnail_large?.src || photo?.thumbnail?.src
  const showPhoto = !!(photo && photoSrc && !imgError)

  // V4: special squawk badge
  const specialSquawk = ac.squawk ? SPECIAL_SQUAWKS[String(ac.squawk).padStart(4, '0')] : null

  return (
    <div className="ac-info-panel">
      <div className="ac-info-header">
        <span className="ac-info-title">
          {flag && <span className="ac-info-flag" title={country} aria-label={country} role="img">{flag}</span>}
          <span className="ac-info-callsign" style={{ color }}>
            {ac.flight?.trim() || ac.hex}
          </span>
          {/* Kod typu WRAZ z nazwą własną przy znaku wywoławczym: razem
              odpowiadają na pytanie „co to jest", więc stoją obok siebie.
              Nagłówek może się zawinąć (patrz .ac-info-title), bo przy wąskiej
              karcie „E3TF · Sentry (AWACS)" nie zmieści się w jednej linii
              obok znaku wywoławczego, a skracanie zjadałoby właśnie nazwę. */}
          {label && <span className="ac-info-type">{label}</span>}
        </span>
        <button className="ac-info-close" onClick={onClose} aria-label={t('CLOSE_AIRCRAFT_PANEL')}>✕</button>
      </div>

      {specialSquawk && (
        <div className={`ac-info-squawk-badge ac-info-squawk-${specialSquawk.kind}`}>
          {specialSquawk.label}
        </div>
      )}

      {photoState === 'loading' && <div className="ac-info-photo-skeleton" />}

      {showPhoto && (
        <a className="ac-info-photo-wrap" href={photo.link} target="_blank" rel="noopener noreferrer">
          <img
            src={photoSrc}
            alt={ac.flight || ac.hex}
            className="ac-info-photo"
            onError={() => setImgError(true)}
          />
          <span className="ac-info-photo-credit">© {photo.photographer}</span>
        </a>
      )}

      {photoState === 'not-found' && (
        <div className="ac-info-photo-empty">{t('PHOTO_NOT_FOUND')}</div>
      )}

      {photoState === 'error' && (
        <div className="ac-info-photo-empty" style={{ color: '#ffb74d', borderColor: 'rgba(255,183,77,0.3)' }}>
          {t('PHOTO_ERROR')}
        </div>
      )}

      {landing && (
        <div className={`ac-info-landing${landing.onApproach ? ' approach' : ''}`}>
          <span className="ac-info-landing-ico">🛬</span>
          <span>
            {landing.onApproach ? t('INFO_LANDING_APPROACH') : t('INFO_LANDING')}:{' '}
            <strong>{landing.icao} {landing.name}</strong>
            <span className="ac-info-landing-dist"> · {landing.distKm} km</span>
          </span>
        </div>
      )}

      <div className="ac-info-readout">
        <div className="ac-info-metric">
          <span className="ac-info-metric__line">
            {trend && (
              <span
                className={`ac-info-trend ac-info-trend--${trend.dir}`}
                title={trend.label}
                aria-label={trend.label}
                role="img"
              >{trend.icon}</span>
            )}
            <span className="ac-info-metric__val">
              {altM != null ? altM.toLocaleString('pl-PL') : '—'}
            </span>
            <span className="ac-info-metric__unit">m</span>
          </span>
          <span className="ac-info-metric__label">{t('INFO_ALTITUDE')}</span>
        </div>
        <div className="ac-info-metric">
          <span className="ac-info-metric__line">
            <span className="ac-info-metric__val">{kmh != null ? kmh : '—'}</span>
            <span className="ac-info-metric__unit">km/h</span>
          </span>
          <span className="ac-info-metric__label">{t('INFO_SPEED')}</span>
        </div>
        <div className="ac-info-metric" title={t('INFO_FLIGHT_TIME_HINT')}>
          <span className="ac-info-metric__line">
            <span className="ac-info-metric__val">{flightTime ? flightTime.val : '—'}</span>
            {flightTime && <span className="ac-info-metric__unit">{flightTime.unit}</span>}
          </span>
          <span className="ac-info-metric__label">{t('INFO_FLIGHT_TIME')}</span>
        </div>
      </div>

      <a
        className="ac-info-ext-link"
        href={`https://globe.adsbexchange.com/?icao=${ac.hex}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('EXT_LINK')}
      </a>
    </div>
  )
}
