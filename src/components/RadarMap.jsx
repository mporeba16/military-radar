import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './RadarMap.css'
import { SHAPES, getShapeKey, altToColor, ftToM, knToKmh } from './aircraftShapes'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const TILE_LAYERS = [
  {
    id: 'osm-adsbx',
    name: 'OSM ADSBx',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    filter: 'saturate(0.65) brightness(0.60) contrast(1.1)',
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

function buildIcon(ac, isSelected, iconScale = 1) {
  const heading = ac.track || 0
  const altM = ftToM(ac.alt_baro)
  const color = isSelected ? '#ffffff' : altToColor(altM)
  const shapeKey = getShapeKey(ac.t)
  const shape = SHAPES[shapeKey] || SHAPES.jet

  const { cx, cy, scale, sz = 44 } = shape
  const displaySz = Math.round(sz * iconScale)
  const half = sz / 2  // viewBox stays fixed at base sz
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

function IconSizeControl({ value, onChange }) {
  const pct = Math.round(value * 100)
  return (
    <div className="icon-size-control">
      <div className="icon-size-label">
        <span>IKONY</span>
        <span>{pct}%</span>
      </div>
      <input
        type="range"
        min="0.5"
        max="2"
        step="0.05"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="icon-size-slider"
      />
    </div>
  )
}

function LayerPicker({ activeId, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const active = TILE_LAYERS.find(l => l.id === activeId)

  return (
    <div className="layer-picker" ref={ref}>
      <button className="layer-picker-btn" onClick={() => setOpen(o => !o)}>
        ⊞ {active?.name}
      </button>
      {open && (
        <div className="layer-picker-panel">
          <div className="layer-picker-title">MAPA</div>
          {TILE_LAYERS.map(layer => (
            <label
              key={layer.id}
              className={`layer-option ${activeId === layer.id ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="tileLayer"
                checked={activeId === layer.id}
                onChange={() => { onChange(layer.id); setOpen(false) }}
              />
              {layer.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RadarMap({ aircraft, center, radius, mode, selectedHex, onSelect }) {
  const initialZoom = mode === 'poland' ? 6 : 8
  const markersRef = useRef({})
  const [activeTileId, setActiveTileId] = useState('osm-adsbx')
  const [iconScale, setIconScale] = useState(1)
  const tileLayer = TILE_LAYERS.find(l => l.id === activeTileId) || TILE_LAYERS[0]

  return (
    <div style={{ flex: 1, position: 'relative' }}>
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

        {aircraft.map(ac => (
          <Marker
            key={ac.hex}
            position={[ac.lat, ac.lon]}
            icon={buildIcon(ac, ac.hex === selectedHex, iconScale)}
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

      <LayerPicker activeId={activeTileId} onChange={setActiveTileId} />
      <IconSizeControl value={iconScale} onChange={setIconScale} />
      <AltitudeLegend />

      <div className="map-overlay-count">
        {aircraft.length} obiektów
      </div>
    </div>
  )
}

function AircraftPopup({ ac }) {
  const altM = ftToM(ac.alt_baro)
  const kmh = knToKmh(ac.gs)
  const color = altToColor(altM)
  const rows = [
    ['Typ',      ac.t || '—'],
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
  const stops = [
    ['rgb(255,20,20)',  '0'],
    ['rgb(255,215,0)',  '3k'],
    ['rgb(0,200,20)',   '6k'],
    ['rgb(0,200,255)',  '9k'],
    ['rgb(80,60,255)',  '12k'],
    ['rgb(180,0,255)', '15k+'],
  ]
  const gradient = `linear-gradient(to right, ${stops.map(([c]) => c).join(', ')})`

  return (
    <div className="alt-legend">
      <div className="alt-legend-bar" style={{ background: gradient }} />
      <div className="alt-legend-labels">
        {stops.map(([, label]) => <span key={label}>{label}</span>)}
      </div>
      <div className="alt-legend-title">m n.p.m.</div>
    </div>
  )
}
