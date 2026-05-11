import { useState, useEffect } from 'react'
import { altToColor, ftToM, knToKmh, getCommonName, countryFromHex, countryFlag } from './aircraftShapes'
import './AircraftInfoPanel.css'

function useAircraftPhoto(hex) {
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!hex) return
    setPhoto(null)
    setLoading(true)
    const ctrl = new AbortController()
    fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => setPhoto(data?.photos?.length ? data.photos[0] : null))
      .catch(err => { if (err.name !== 'AbortError') setPhoto(null) })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [hex])
  return { photo, loading }
}

export default function AircraftInfoPanel({ ac, onClose }) {
  const { photo, loading: photoLoading } = useAircraftPhoto(ac.hex)
  const [imgError, setImgError] = useState(false)
  const altM = ftToM(ac.alt_baro)
  const kmh = knToKmh(ac.gs)
  const color = altToColor(altM)
  const commonName = getCommonName(ac.t)
  const country = ac.country || countryFromHex(ac.hex)

  // Reset img error state when photo changes
  useEffect(() => { setImgError(false) }, [photo])

  const vsLabel = ac.baro_rate != null
    ? (ac.baro_rate > 64 ? `▲ +${ac.baro_rate}` : ac.baro_rate < -64 ? `▼ ${ac.baro_rate}` : '→ 0')
    : null

  const rows = [
    ['Typ',      ac.t ? (commonName ? `${ac.t} · ${commonName}` : ac.t) : '—'],
    ac._dist != null ? ['Odległość', `${Math.round(ac._dist)} km`] : null,
    ['Wysokość', altM != null ? `${altM.toLocaleString()} m` : '—'],
    vsLabel ? ['V/S', `${vsLabel} ft/min`] : null,
    ['Prędkość', kmh != null ? `${kmh} km/h` : '—'],
    ['Kurs',     ac.track != null ? `${Math.round(ac.track)}°` : '—'],
    ac.reg  ? ['Rej.',   ac.reg]      : null,
    country ? ['Kraj', `${countryFlag(country)} ${country}`.trim()] : null,
    ['Squawk',   ac.squawk || '—'],
    ['ICAO',     ac.hex],
  ].filter(Boolean)

  const photoSrc = photo?.thumbnail_large?.src || photo?.thumbnail?.src
  const showPhoto = !!(photo && photoSrc && !imgError)

  return (
    <div className="ac-info-panel">
      <div className="ac-info-header">
        <span className="ac-info-callsign" style={{ color }}>
          {ac.flight?.trim() || ac.hex}
        </span>
        <button className="ac-info-close" onClick={onClose}>✕</button>
      </div>

      {photoLoading && <div className="ac-info-photo-skeleton" />}

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
