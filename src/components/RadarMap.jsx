import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './RadarMap.css'
import { SHAPES, getShapeKey, altToColor } from './aircraftShapes'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function buildIcon(ac, isSelected) {
  const heading = ac.track || 0
  const color = isSelected ? '#ffffff' : altToColor(ac.alt_baro)
  const shapeKey = getShapeKey(ac.t)
  const pathD = SHAPES[shapeKey] || SHAPES.jet

  // Cień pod ikoną dla czytelności na mapie
  const shadow = `<path d="${pathD}" fill="rgba(0,0,0,0.45)" transform="translate(1.5,1.5)"/>`

  // Obramowanie zaznaczenia
  const selectionRing = isSelected
    ? `<circle r="16" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.9"/>`
    : ''

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="36" height="36"
         viewBox="-18 -18 36 36">
      <g transform="rotate(${heading})">
        ${shadow}
        <path d="${pathD}"
              fill="${color}"
              stroke="rgba(0,0,0,0.6)"
              stroke-width="0.5"
              stroke-linejoin="round"/>
      </g>
      ${selectionRing}
    </svg>`

  return L.divIcon({
    html: svg,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    className: '',
  })
}

function RecenterOnChange({ center }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true })
  }, [center, map])
  return null
}

function FlyToSelected({ selectedHex, markersRef }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedHex) return
    const marker = markersRef.current[selectedHex]
    if (!marker) return
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 8), { duration: 0.8 })
    setTimeout(() => marker.openPopup(), 850)
  }, [selectedHex, map, markersRef])
  return null
}

export default function RadarMap({ aircraft, center, radius, mode, selectedHex, onSelect }) {
  const initialZoom = mode === 'poland' ? 6 : 8
  const markersRef = useRef({})

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
        <FlyToSelected selectedHex={selectedHex} markersRef={markersRef} />

        {radius && (
          <Circle
            center={center}
            radius={radius * 1000}
            pathOptions={{
              color: '#00ff88',
              fillColor: '#00ff88',
              fillOpacity: 0.04,
              weight: 1,
              dashArray: '6 4',
            }}
          />
        )}

        {aircraft.map(ac => (
          <Marker
            key={ac.hex}
            position={[ac.lat, ac.lon]}
            icon={buildIcon(ac, ac.hex === selectedHex)}
            ref={el => {
              if (el) markersRef.current[ac.hex] = el
              else delete markersRef.current[ac.hex]
            }}
            eventHandlers={{ click: () => onSelect?.(ac.hex) }}
          >
            <Popup className="ac-popup">
              <AircraftPopup ac={ac} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <AltitudeLegend />

      <div className="map-overlay-count">
        {aircraft.length} obiektów
      </div>
    </div>
  )
}

function AircraftPopup({ ac }) {
  const color = altToColor(ac.alt_baro)
  const rows = [
    ['Typ',      ac.t || '—'],
    ['Alt',      ac.alt_baro ? `${ac.alt_baro.toLocaleString()} ft` : '—'],
    ['Prędkość', ac.gs ? `${Math.round(ac.gs)} kn` : '—'],
    ['Kurs',     ac.track != null ? `${Math.round(ac.track)}°` : '—'],
    ['Kraj',     ac.country || '—'],
    ['Squawk',   ac.squawk || '—'],
    ['ICAO',     ac.hex],
  ]

  return (
    <div className="popup-inner">
      <div className="popup-callsign" style={{ color }}>
        {ac.flight?.trim() || ac.hex}
      </div>
      <table className="popup-table">
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label}>
              <td className="popup-label">{label}</td>
              <td className="popup-val">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AltitudeLegend() {
  const stops = [
    [0,     'rgb(255,20,20)',   '0'],
    [10000, 'rgb(255,215,0)',   '10k'],
    [20000, 'rgb(0,200,20)',    '20k'],
    [30000, 'rgb(0,200,255)',   '30k'],
    [40000, 'rgb(80,60,255)',   '40k'],
    [50000, 'rgb(180,0,255)',   '50k+'],
  ]

  const gradient = `linear-gradient(to right, ${stops.map(([, c]) => c).join(', ')})`

  return (
    <div className="alt-legend">
      <div className="alt-legend-bar" style={{ background: gradient }} />
      <div className="alt-legend-labels">
        {stops.map(([, , label]) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="alt-legend-title">ft</div>
    </div>
  )
}
