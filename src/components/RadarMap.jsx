import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Naprawia brakujące ikony Leaflet przy bundlowaniu przez Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function aircraftIcon(ac) {
  const heading = ac.track || 0
  const isAlert = ac._inRadius
  const color = isAlert ? '#ff6b35' : '#00ff88'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <g transform="rotate(${heading}, 14, 14)">
        <polygon points="14,2 18,22 14,18 10,22" fill="${color}" opacity="0.9"/>
        <polygon points="14,8 22,16 14,13 6,16" fill="${color}" opacity="0.6"/>
      </g>
      ${isAlert ? '<circle cx="14" cy="14" r="12" fill="none" stroke="#ff6b35" stroke-width="1.5" opacity="0.6"/>' : ''}
    </svg>`
  return L.divIcon({
    html: svg,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    className: ''
  })
}

function RecenterOnChange({ center }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true })
  }, [center, map])
  return null
}

export default function RadarMap({ aircraft, center, radius, mode }) {
  const initialZoom = mode === 'poland' ? 6 : 8

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={initialZoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          maxZoom={18}
        />

        <RecenterOnChange center={center} />

        {radius && (
          <Circle
            center={center}
            radius={radius * 1000}
            pathOptions={{
              color: '#00ff88',
              fillColor: '#00ff88',
              fillOpacity: 0.04,
              weight: 1,
              dashArray: '6 4'
            }}
          />
        )}

        {aircraft.map(ac => (
          <Marker
            key={ac.hex}
            position={[ac.lat, ac.lon]}
            icon={aircraftIcon(ac)}
          >
            <Popup className="ac-popup">
              <AircraftPopup ac={ac} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="map-overlay-count">
        {aircraft.length} obiektów
      </div>
    </div>
  )
}

function AircraftPopup({ ac }) {
  return (
    <div style={{ fontFamily: 'Courier New, monospace', minWidth: 180 }}>
      <div style={{ color: '#00ff88', fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>
        {ac.flight?.trim() || ac.hex}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          {[
            ['Typ', ac.t || '—'],
            ['Alt', ac.alt_baro ? `${ac.alt_baro} ft` : '—'],
            ['Prędkość', ac.gs ? `${Math.round(ac.gs)} kn` : '—'],
            ['Kurs', ac.track != null ? `${Math.round(ac.track)}°` : '—'],
            ['Kraj', ac.ownOp || ac.country || '—'],
            ['Squawk', ac.squawk || '—'],
            ['ICAO', ac.hex],
          ].map(([label, val]) => (
            <tr key={label}>
              <td style={{ color: '#7a9ab5', paddingRight: 8 }}>{label}</td>
              <td style={{ color: '#e0e8f0' }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
