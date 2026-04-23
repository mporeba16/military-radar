import './AircraftList.css'

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function AircraftList({ aircraft, userLocation }) {
  const sorted = userLocation
    ? [...aircraft].sort((a, b) => {
        const da = haversine(userLocation.lat, userLocation.lon, a.lat, a.lon)
        const db = haversine(userLocation.lat, userLocation.lon, b.lat, b.lon)
        return da - db
      })
    : aircraft

  if (sorted.length === 0) {
    return (
      <div className="ac-list empty">
        <div className="empty-icon">◎</div>
        <div className="empty-text">Brak obiektów w zasięgu</div>
      </div>
    )
  }

  return (
    <div className="ac-list">
      <div className="ac-list-header">OBIEKTY ({sorted.length})</div>
      <div className="ac-list-items">
        {sorted.map(ac => {
          const dist = userLocation
            ? Math.round(haversine(userLocation.lat, userLocation.lon, ac.lat, ac.lon))
            : null
          return (
            <div key={ac.hex} className={`ac-item ${ac._inRadius ? 'in-radius' : ''}`}>
              <div className="ac-item-top">
                <span className="ac-callsign">{ac.flight?.trim() || ac.hex}</span>
                {dist !== null && <span className="ac-dist">{dist} km</span>}
              </div>
              <div className="ac-item-bottom">
                <span className="ac-type">{ac.t || '???'}</span>
                {ac.alt_baro && <span className="ac-alt">{ac.alt_baro} ft</span>}
                {ac.gs && <span className="ac-speed">{Math.round(ac.gs)} kn</span>}
                {ac.squawk && <span className="ac-squawk">SQ:{ac.squawk}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
