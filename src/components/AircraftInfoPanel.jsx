import { useState, useEffect } from 'react'
import { altToColor, ftToM, knToKmh, getCommonName, countryFromHex, countryFlag } from './aircraftShapes'
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

// M3: closest approach prediction (great-circle approximation on a local plane)
function closestApproach(userLat, userLon, ac) {
  if (ac.track == null || ac.gs == null || ac.gs < 30) return null
  const cosLat = Math.cos(userLat * Math.PI / 180)
  const rx = (ac.lon - userLon) * 111 * cosLat // km east
  const ry = (ac.lat - userLat) * 111           // km north
  const speedKmh = ac.gs * 1.852
  const vx = speedKmh * Math.sin(ac.track * Math.PI / 180)
  const vy = speedKmh * Math.cos(ac.track * Math.PI / 180)
  const v2 = vx * vx + vy * vy
  if (v2 < 0.1) return null
  const tHours = -(rx * vx + ry * vy) / v2
  if (tHours < 0) return { approaching: false }
  const minDistKm = Math.sqrt(Math.max(0, rx * rx + ry * ry - Math.pow(rx * vx + ry * vy, 2) / v2))
  return { approaching: true, tMinutes: tHours * 60, minDistKm }
}

// M5: rough flight phase from V/S and altitude (feet)
function flightPhase(ac) {
  if (ac.on_ground) return 'Na ziemi'
  if (ac.alt_baro == null) return null
  const altFt = ac.alt_baro
  const vs = ac.baro_rate || 0
  if (altFt < 1500 && vs > 300) return 'Wznosi się po starcie'
  if (altFt < 5000 && vs < -300) return 'Podejście do lądowania'
  if (vs > 500) return 'Wznoszenie'
  if (vs < -500) return 'Zniżanie'
  return 'Przelot'
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

// planespotters.net has separate lookup paths for hex vs registration.
// For many military aircraft (Mi-17, etc.) the hex→photo mapping is empty
// while the registration→photo mapping returns the photo we expect.
function useAircraftPhoto(hex, reg) {
  const [photo, setPhoto] = useState(null)
  const [state, setState] = useState('idle')  // 'idle' | 'loading' | 'ok' | 'not-found'
  useEffect(() => {
    if (!hex) return
    setPhoto(null)
    setState('loading')
    const ctrl = new AbortController()
    const fetchJson = async (url) => {
      const r = await fetch(url, { signal: ctrl.signal })
      return r.json()
    }
    ;(async () => {
      try {
        // 1) hex first — fast path, works for civil aircraft
        const byHex = await fetchJson(`https://api.planespotters.net/pub/photos/hex/${hex}`)
        if (byHex?.photos?.length) {
          setPhoto(byHex.photos[0]); setState('ok'); return
        }
        // 2) fallback to registration — catches military aircraft
        if (reg) {
          const byReg = await fetchJson(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`)
          if (byReg?.photos?.length) {
            setPhoto(byReg.photos[0]); setState('ok'); return
          }
        }
        setPhoto(null); setState('not-found')
      } catch (err) {
        if (err.name === 'AbortError') return
        setPhoto(null); setState('not-found')
      }
    })()
    return () => ctrl.abort()
  }, [hex, reg])
  return { photo, state }
}

export default function AircraftInfoPanel({ ac, trailSources, firstSeen, userLocation, onClose }) {
  const { photo, state: photoState } = useAircraftPhoto(ac.hex, ac.reg)
  const [imgError, setImgError] = useState(false)
  const altM = ftToM(ac.alt_baro)
  const kmh = knToKmh(ac.gs)
  const color = altToColor(altM)
  const commonName = getCommonName(ac.t)
  const country = ac.country || countryFromHex(ac.hex)
  const operator = operatorFrom(ac.flight)
  const phase = flightPhase(ac)

  useEffect(() => { setImgError(false) }, [photo])

  const vsLabel = ac.baro_rate != null
    ? (ac.baro_rate > 64 ? `▲ +${ac.baro_rate}` : ac.baro_rate < -64 ? `▼ ${ac.baro_rate}` : '→ 0')
    : null

  // M2: distance + bearing combined
  const distRow = ac._dist != null
    ? `${Math.round(ac._dist)} km${ac._bearing != null ? ` · ${bearingLabel(ac._bearing)}` : ''}`
    : null

  // M3: closest approach
  const approach = userLocation && ac.lat != null && ac.lon != null
    ? closestApproach(userLocation.lat, userLocation.lon, ac)
    : null
  const approachRow = approach == null
    ? null
    : approach.approaching === false
      ? 'Oddala się'
      : `Zbliża się · za ${Math.round(approach.tMinutes)} min (~${Math.round(approach.minDistKm)} km)`

  const rows = [
    ['Typ',       ac.t ? (commonName ? `${ac.t} · ${commonName}` : ac.t) : '—'],
    operator ? ['Operator',  operator] : null,
    distRow ? ['Odległość', distRow] : null,
    approachRow ? ['Przebieg', approachRow] : null,
    ['Wysokość', altM != null ? `${altM.toLocaleString()} m` : '—'],
    phase ? ['Faza',     phase] : null,
    vsLabel ? ['V/S', `${vsLabel} ft/min`] : null,
    ['Prędkość', kmh != null ? `${kmh} km/h` : '—'],
    country ? ['Kraj',  `${countryFlag(country)} ${country}`.trim()] : null,
    firstSeen ? ['Na radarze', `${formatDuration(Date.now() - firstSeen)} · od ${formatHhmm(firstSeen)}`] : null,
  ].filter(Boolean)

  const photoSrc = photo?.thumbnail_large?.src || photo?.thumbnail?.src
  const showPhoto = !!(photo && photoSrc && !imgError)

  // V4: special squawk badge
  const specialSquawk = ac.squawk ? SPECIAL_SQUAWKS[String(ac.squawk).padStart(4, '0')] : null

  // M1: trail summary with duration + start time
  let trailLine = null
  if (trailSources) {
    const count = trailSources.blob || 0
    const parts = [`${count} pkt`]
    if (trailSources.blobFirstTs && trailSources.blobLastTs) {
      const spanMs = trailSources.blobLastTs - trailSources.blobFirstTs
      parts.push(formatDuration(spanMs))
      parts.push(`od ${formatHhmm(trailSources.blobFirstTs)}`)
    }
    trailLine = parts.join(' · ')
  }

  return (
    <div className="ac-info-panel">
      <div className="ac-info-header">
        <span className="ac-info-callsign" style={{ color }}>
          {ac.flight?.trim() || ac.hex}
        </span>
        <button className="ac-info-close" onClick={onClose}>✕</button>
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
        <div className="ac-info-photo-empty">🛩 Brak zdjęcia w planespotters.net</div>
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
          Trasa: <span style={{ color: '#fff' }}>{trailLine}</span>
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
        Otwórz w ADS-B Exchange ↗
      </a>
    </div>
  )
}
