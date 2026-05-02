import { useState, useEffect } from 'react'
import { altToColor, ftToM, knToKmh, getCommonName, countryFromHex, countryFlag } from './aircraftShapes'
import './AircraftInfoPanel.css'

function useAircraftPhoto(hex) {
  const [photo, setPhoto] = useState(null)
  useEffect(() => {
    if (!hex) return
    setPhoto(null)
    let cancelled = false
    fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`)
      .then(r => r.json())
      .then(data => { if (!cancelled && data?.photos?.length) setPhoto(data.photos[0]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hex])
  return photo
}

export default function AircraftInfoPanel({ ac, onClose }) {
  const photo = useAircraftPhoto(ac.hex)
  const altM = ftToM(ac.alt_baro)
  const kmh = knToKmh(ac.gs)
  const color = altToColor(altM)
  const commonName = getCommonName(ac.t)

  const country = ac.country || countryFromHex(ac.hex)

  const vsLabel = ac.baro_rate != null
    ? (ac.baro_rate > 64 ? `▲ +${ac.baro_rate}` : ac.baro_rate < -64 ? `▼ ${ac.baro_rate}` : '→ 0')
    : null

  const rows = [
    ['Typ',      ac.t ? (commonName ? `${ac.t} · ${commonName}` : ac.t) : '—'],
    ['Wysokość', altM != null ? `${altM.toLocaleString()} m` : '—'],
    vsLabel ? ['V/S', `${vsLabel} ft/min`] : null,
    ['Prędkość', kmh != null ? `${kmh} km/h` : '—'],
    ['Kurs',     ac.track != null ? `${Math.round(ac.track)}°` : '—'],
    ac.reg  ? ['Rej.',   ac.reg]      : null,
    country ? ['Kraj', `${countryFlag(country)} ${country}`.trim()] : null,
    ['Squawk',   ac.squawk || '—'],
    ['ICAO',     ac.hex],
  ].filter(Boolean)

  return (
    <div className="ac-info-panel">
      <div className="ac-info-header">
        <span className="ac-info-callsign" style={{ color }}>
          {ac.flight?.trim() || ac.hex}
        </span>
        <button className="ac-info-close" onClick={onClose}>✕</button>
      </div>

      {photo && (
        <a className="ac-info-photo-wrap" href={photo.link} target="_blank" rel="noopener noreferrer">
          <img
            src={photo.thumbnail_large?.src || photo.thumbnail?.src}
            alt={ac.flight || ac.hex}
            className="ac-info-photo"
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
