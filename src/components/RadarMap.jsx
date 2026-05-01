import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './RadarMap.css'
import { SHAPES, getShapeKey, getCommonName, altToColor, ftToM, knToKmh } from './aircraftShapes'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export const TILE_LAYERS = [
  {
    id: 'osm-adsbx',
    name: 'OSM ADSBx',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    filter: 'saturate(0.55) brightness(0.54) contrast(1.1)',
  },
  {
    id: 'carto-voyager',
    name: 'Carto Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    filter: '',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    filter: '',
  },
  {
    id: 'esri-satellite',
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
    maxZoom: 18,
    filter: '',
  },
]

function buildIcon(ac, isSelected) {
  const heading = ac.track || 0
  const altM = ftToM(ac.alt_baro)
  const color = isSelected ? '#ffffff' : altToColor(altM)
  const shapeKey = getShapeKey(ac.t)
  const shape = SHAPES[shapeKey] || SHAPES.jet

  const { cx, cy, scale, sz = 44 } = shape
  const displaySz = sz
  const half = sz / 2
  const paths = Array.isArray(shape.path) ? shape.path : [shape.path]

  const tx = `scale(${scale}) translate(${-cx} ${-cy})`

  const mainPaths = paths.map(d =>
    `<path d="${d}" fill="${color}" stroke="rgba(0,0,0,0.55)" stroke-width="${0.7 / scale}" stroke-linejoin="round"/>`
  ).join('')

  const shadowPaths = paths.map(d =>
    `<path d="${d}" fill="rgba(0,0,0,0.4)"/>`
  ).join('')

  const ringR = Math.min(16, half - 2)
  const selectionRing = isSelected
    ? `<circle r="${ringR}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.9"/>`
    : ''

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${displaySz}" height="${displaySz}"
         viewBox="-${half} -${half} ${sz} ${sz}">
      <g transform="rotate(${heading})">
        <g transform="translate(1.2,1.2)"><g transform="${tx}">${shadowPaths}</g></g>
        <g transform="${tx}">${mainPaths}</g>
      </g>
      ${selectionRing}
    </svg>`

  return L.divIcon({
    html: svg,
    iconSize: [displaySz, displaySz],
    iconAnchor: [displaySz / 2, displaySz / 2],
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
  const prevHexRef = useRef(null)

  useEffect(() => {
    if (prevHexRef.current) {
      const prev = markersRef.current[prevHexRef.current]
      if (prev) prev.closePopup()
    }
    prevHexRef.current = selectedHex

    if (!selectedHex) return
    const marker = markersRef.current[selectedHex]
    if (!marker) return
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 8), { duration: 0.8 })
    setTimeout(() => marker.openPopup(), 850)
  }, [selectedHex, map, markersRef])
  return null
}

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click: () => onSelect(null),
  })
  return null
}

function TileFilter({ filter }) {
  const map = useMap()
  useEffect(() => {
    map.getPanes().tilePane.style.filter = filter || ''
  }, [filter, map])
  return null
}




export default function RadarMap({ aircraft, trails, serverTrails, center, radius, mode, selectedHex, onSelect, activeTileId }) {
  const initialZoom = mode === 'poland' ? 6 : 8
  const markersRef = useRef({})
  const tileLayer = TILE_LAYERS.find(l => l.id === activeTileId) || TILE_LAYERS[0]

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapContainer
        center={center}
        zoom={initialZoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          key={tileLayer.id}
          url={tileLayer.url}
          attribution={tileLayer.attribution}
          maxZoom={tileLayer.maxZoom}
        />

        <ZoomControl position="bottomright" />
        <RecenterOnChange center={center} />
        <FlyToSelected selectedHex={selectedHex} markersRef={markersRef} />
        <MapClickHandler onSelect={onSelect} />
        <TileFilter filter={tileLayer.filter} />

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

        {(() => {
          if (!selectedHex) return null
          const clientPts = trails?.current?.get(selectedHex) || []
          const serverPts = serverTrails?.get(selectedHex) || []
          const clientTs = new Set(clientPts.map(p => p.ts))
          const merged = [...serverPts.filter(p => !clientTs.has(p.ts)), ...clientPts]
          merged.sort((a, b) => a.ts - b.ts)
          if (merged.length < 2) return null
          return merged.slice(1).map((pt, i) => (
            <Polyline
              key={`trail-${selectedHex}-${i}`}
              positions={[[merged[i].lat, merged[i].lon], [pt.lat, pt.lon]]}
              pathOptions={{ color: altToColor(ftToM(pt.alt)), weight: 2.5, opacity: 0.85 }}
            />
          ))
        })()}

        {aircraft.map(ac => (
          <Marker
            key={ac.hex}
            position={[ac.lat, ac.lon]}
            icon={buildIcon(ac, ac.hex === selectedHex)}
            ref={el => {
              if (el) markersRef.current[ac.hex] = el
              else delete markersRef.current[ac.hex]
            }}
            eventHandlers={{ click: () => onSelect?.(ac.hex === selectedHex ? null : ac.hex) }}
          >
            <Popup className="ac-popup">
              <AircraftPopup ac={ac} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <AltitudeLegend />
    </div>
  )
}

function useAircraftPhoto(hex) {
  const [photo, setPhoto] = useState(null)
  useEffect(() => {
    if (!hex) return
    setPhoto(null)
    let cancelled = false
    fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data?.photos?.length) setPhoto(data.photos[0])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hex])
  return photo
}


function AircraftPopup({ ac }) {
  const altM = ftToM(ac.alt_baro)
  const kmh = knToKmh(ac.gs)
  const color = altToColor(altM)
  const photo = useAircraftPhoto(ac.hex)

  const commonName = getCommonName(ac.t)
  const rows = [
    ['Typ',      ac.t ? (commonName ? `${ac.t} · ${commonName}` : ac.t) : '—'],
    ['Wys.',     altM != null ? `${altM.toLocaleString()} m` : '—'],
    ['Prędkość', kmh != null ? `${kmh} km/h` : '—'],
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

      {photo && (
        <a
          className="popup-photo-wrap"
          href={photo.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src={photo.thumbnail_large?.src || photo.thumbnail?.src}
            alt={ac.flight || ac.hex}
            className="popup-photo"
          />
          <span className="popup-photo-credit">© {photo.photographer}</span>
        </a>
      )}

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
      <a
        className="popup-adsbx-link"
        href={`https://globe.adsbexchange.com/?icao=${ac.hex}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Otwórz w ADS-B Exchange ↗
      </a>
    </div>
  )
}

function AltitudeLegend() {
  // Colors matching altToColor breakpoints (altM values)
  const colorStops = [
    { m: 0,     color: 'rgb(255,20,20)' },
    { m: 600,   color: 'rgb(255,128,0)' },
    { m: 1500,  color: 'rgb(255,215,0)' },
    { m: 3000,  color: 'rgb(160,230,0)' },
    { m: 6100,  color: 'rgb(0,200,20)' },
    { m: 9100,  color: 'rgb(0,200,255)' },
    { m: 12200, color: 'rgb(80,60,255)' },
    { m: 15200, color: 'rgb(180,0,255)' },
  ]
  const maxM = 15200
  const gradient = `linear-gradient(to right, ${colorStops.map(s => `${s.color} ${(s.m / maxM * 100).toFixed(1)}%`).join(', ')})`

  const ticks = [0, 1500, 3000, 6000, 9000, 12000, 15000]

  return (
    <div className="alt-legend">
      <div className="alt-legend-title">WYSOKOŚĆ (m)</div>
      <div className="alt-legend-bar" style={{ background: gradient }} />
      <div className="alt-legend-labels">
        {ticks.map(m => (
          <span key={m} style={{ left: `${(m / maxM * 100).toFixed(1)}%` }}>
            {m === 0 ? '0' : m >= 1000 ? `${m / 1000}k` : m}
          </span>
        ))}
      </div>
    </div>
  )
}
