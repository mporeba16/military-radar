import { useState, useEffect } from 'react'
import { altToColor, ftToM, knToKmh, getCommonName, countryFromHex, countryFlag } from './aircraftShapes'
import { findLikelyLanding } from '../airfields'
import { scorePhotoMatch, photoHasMatchSignal } from '../lib/photoMatch'
import { t, useLang, getLang } from '../i18n'
import './AircraftInfoPanel.css'

// V4: ICAO special transponder codes that mean something serious
const SPECIAL_SQUAWKS = {
  '7500': { label: '🚨 7500 PORWANIE', kind: 'critical' },
  '7600': { label: '⚠ 7600 BRAK ŁĄCZNOŚCI', kind: 'warn' },
  '7700': { label: '🚨 7700 EMERGENCY', kind: 'critical' },
  '7400': { label: '⚠ 7400 UTRATA UAV', kind: 'warn' },
}

// V5: operator inferred from callsign prefix
const OPERATOR_PATTERNS = [
  [/^GAF\d/, 'Luftwaffe (Niemcy)'],
  [/^LIFT/, 'Luftwaffe (Niemcy)'],
  [/^RCF/, 'Siły Powietrzne RP'],
  [/^PLF/, 'Siły Powietrzne RP'],
  [/^RCH|^REACH/, 'USAF Air Mobility Command'],
  [/^DUKE|^JAKE|^POLO|^GORDO|^PEARL|^FORTE|^RAZER|^KNIFE|^IRON|^SWORD|^VALOR|^HEAVY|^EAGLE\d|^VIPER|^DEMON|^KNIGHT|^SHADOW|^GHOST|^RAVEN|^STALLION|^RANGER\d|^TIGER\d|^VENOM|^SPECTRE|^SPOOKY|^JOLLY|^PEDRO|^KING\d|^PAVE|^COMBAT/, 'USAF / US Air Force'],
  [/^MAGMA|^ASCOT|^COMET/, 'RAF (Wlk. Brytania)'],
  [/^NATO|^NAOC|^NATOQ/, 'NATO'],
  [/^FRAF/, 'Armée de l\'Air (Francja)'],
  [/^BAF\d/, 'Belgian Air Force'],
  [/^DAMP/, 'Danish Air Force'],
  [/^CZAF/, 'Czech Air Force'],
  [/^SLAF/, 'Slovak Air Force'],
  [/^HUNAF/, 'Hungarian Air Force'],
  [/^BUAF/, 'Bulgarian Air Force'],
  [/^ROTAF/, 'Romanian Air Force'],
  [/^FNY|^FINAF/, 'Finnish Air Force'],
  [/^NRAF|^SAVER/, 'Norwegian Air Force'],
  [/^SWAF/, 'Swedish Air Force'],
  [/^LTAF/, 'Lithuanian Air Force'],
  [/^LVAF/, 'Latvian Air Force'],
  [/^EEAF/, 'Estonian Air Force'],
  [/^RIMC/, 'Aeronautica Militare (Włochy)'],
  [/^BAH/, 'Bahrain Royal Air Force'],
  [/^KAF/, 'Kuwait Air Force'],
  [/^QAF/, 'Qatar Emiri Air Force'],
  [/^OAF/, 'Oman Royal Air Force'],
  [/^SRA/, 'Saudi Royal Air Force'],
  [/^SHAHD/, 'Jordan Royal Air Force'],
]

function operatorFrom(callsign) {
  const cs = (callsign || '').toUpperCase()
  for (const [re, op] of OPERATOR_PATTERNS) {
    if (re.test(cs)) return op
  }
  return null
}

// M2: bearing in degrees → compass direction
function bearingLabel(deg) {
  if (deg == null) return null
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(((deg % 360) / 45)) % 8
  return `${dirs[idx]} · ${Math.round(deg)}°`
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem} min` : `${h}h`
}

function formatHhmm(ts) {
  return new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
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
        // Gdy jest kilku kandydatów, a zwycięzca nie ma ŻADNEGO sygnału
        // identyfikującego (typ/operator), nie zgadujemy — kolejność z API jest
        // wtedy przypadkowa względem płatowca, więc lepiej pokazać „brak
        // zdjęcia" niż mylące. Pojedynczy kandydat zostaje (nie ma z czym mylić).
        if (unique.length > 1 && !photoHasMatchSignal(best, ac)) {
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

export default function AircraftInfoPanel({ ac, trailSources, firstSeen, onClose }) {
  useLang()  // re-render on language switch
  const { photo, state: photoState } = useAircraftPhoto(ac.hex, ac.reg, ac)
  const [imgError, setImgError] = useState(false)
  const altM = ftToM(ac.alt_baro)
  const kmh = knToKmh(ac.gs)
  const color = altToColor(altM)
  const commonName = getCommonName(ac.t)
  const country = ac.country || countryFromHex(ac.hex)
  const flag = country ? countryFlag(country) : ''
  const operator = operatorFrom(ac.flight)
  const landing = findLikelyLanding(ac)

  useEffect(() => { setImgError(false) }, [photo])

  const vsLabel = ac.baro_rate != null
    ? (ac.baro_rate > 64 ? `▲ +${ac.baro_rate}` : ac.baro_rate < -64 ? `▼ ${ac.baro_rate}` : '→ 0')
    : null

  // M2: distance + bearing combined
  const distRow = ac._dist != null
    ? `${Math.round(ac._dist)} km${ac._bearing != null ? ` · ${bearingLabel(ac._bearing)}` : ''}`
    : null

  const rows = [
    [t('INFO_TYPE'),       ac.t ? (commonName ? `${ac.t} · ${commonName}` : ac.t) : '—'],
    operator ? [t('INFO_OPERATOR'),  operator] : null,
    distRow ? [t('INFO_DISTANCE'), distRow] : null,
    [t('INFO_ALTITUDE'), altM != null ? `${altM.toLocaleString()} m` : '—'],
    vsLabel ? [t('INFO_VS'), `${vsLabel} ft/min`] : null,
    [t('INFO_SPEED'), kmh != null ? `${kmh} km/h` : '—'],
    country ? [t('INFO_COUNTRY'),  country] : null,
    firstSeen ? [t('INFO_ON_RADAR'), `${formatDuration(Date.now() - firstSeen)} · od ${formatHhmm(firstSeen)}`] : null,
  ].filter(Boolean)

  const photoSrc = photo?.thumbnail_large?.src || photo?.thumbnail?.src
  const showPhoto = !!(photo && photoSrc && !imgError)

  // V4: special squawk badge
  const specialSquawk = ac.squawk ? SPECIAL_SQUAWKS[String(ac.squawk).padStart(4, '0')] : null

  // M1: trail summary with duration + start time
  let trailLine = null
  if (trailSources) {
    const count = trailSources.blob || 0
    const parts = [`${count} ${t('INFO_TRAIL_PTS')}`]
    if (trailSources.blobFirstTs && trailSources.blobLastTs) {
      const spanMs = trailSources.blobLastTs - trailSources.blobFirstTs
      parts.push(formatDuration(spanMs))
      parts.push(`${getLang() === 'en' ? 'from' : 'od'} ${formatHhmm(trailSources.blobFirstTs)}`)
    }
    trailLine = parts.join(' · ')
  }

  return (
    <div className="ac-info-panel">
      <div className="ac-info-header">
        <span className="ac-info-title">
          {flag && <span className="ac-info-flag">{flag}</span>}
          <span className="ac-info-callsign" style={{ color }}>
            {ac.flight?.trim() || ac.hex}
          </span>
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

      <table className="ac-info-table">
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label}>
              <td className="ac-info-label">{label}</td>
              <td className="ac-info-val">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {trailLine && (
        <div className="ac-info-trail-info">
          {t('INFO_TRAIL')} <span style={{ color: '#fff' }}>{trailLine}</span>
          {trailSources?.blobError && (
            <div className="ac-info-trail-warn">{trailSources.blobError}</div>
          )}
        </div>
      )}

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
