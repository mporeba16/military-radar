import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Circle, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './RadarMap.css'
import { SHAPES, getShapeKey, altToColor, ftToM } from './aircraftShapes'

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
  const half = sz / 2
  const paths = Array.isArray(shape.path) ? shape.path : [shape.path]
  const tx = `scale(${scale}) translate(${-cx} ${-cy})`

  const mainPaths = paths.map(d =>
    `<path d="${d}" fill="${color}" stroke="rgba(0,0,0,0.55)" stroke-width="${0.7 / scale}" stroke-linejoin="round"/>`
  ).join('')
  const shadowPaths = paths.map(d => `<path d="${d}" fill="rgba(0,0,0,0.4)"/>`).join('')
  const ringR = Math.min(16, half - 2)
  const selectionRing = isSelected
    ? `<circle r="${ringR}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.9"/>`
    : ''

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="-${half} -${half} ${sz} ${sz}">
      <g transform="rotate(${heading})">
        <g transform="translate(1.2,1.2)"><g transform="${tx}">${shadowPaths}</g></g>
        <g transform="${tx}">${mainPaths}</g>
      </g>
      ${selectionRing}
    </svg>`

  return L.divIcon({ html: svg, iconSize: [sz, sz], iconAnchor: [half, half], className: '' })
}

function RecenterOnChange({ center, centerKey }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey])
  return null
}

function MapClickHandler({ onSelect }) {
  useMapEvents({ click: () => onSelect(null) })
  return null
}

function TileFilter({ filter }) {
  const map = useMap()
  useEffect(() => {
    map.getPanes().tilePane.style.filter = filter || ''
  }, [filter, map])
  return null
}

export default function RadarMap({ aircraft, trails, serverTrails, center, centerKey, radius, mode, selectedHex, onSelect, activeTileId }) {
  const initialZoom = mode === 'europe' ? 5 : mode === 'poland' ? 6 : 8
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
        <TileLayer key={tileLayer.id} url={tileLayer.url} attribution={tileLayer.attribution} maxZoom={tileLayer.maxZoom} />
        <ZoomControl position="bottomright" />
        <RecenterOnChange center={center} centerKey={centerKey} />
        <MapClickHandler onSelect={onSelect} />
        <TileFilter filter={tileLayer.filter} />

        {radius && (
          <Circle center={center} radius={radius * 1000} pathOptions={{
            color: '#00ff88', fillColor: '#00ff88', fillOpacity: 0.04, weight: 1, dashArray: '6 4',
          }} />
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
            ref={el => { if (el) markersRef.current[ac.hex] = el; else delete markersRef.current[ac.hex] }}
            eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); onSelect?.(ac.hex === selectedHex ? null : ac.hex) } }}
          />
        ))}
      </MapContainer>

      <AltitudeLegend />
    </div>
  )
}

function AltitudeLegend() {
  const colorStops = [
    { m:     0, color: 'rgb(255,80,0)' },
    { m:   150, color: 'rgb(255,140,0)' },
    { m:   300, color: 'rgb(255,200,0)' },
    { m:   600, color: 'rgb(255,240,0)' },
    { m:  1200, color: 'rgb(180,255,0)' },
    { m:  1800, color: 'rgb(0,220,50)' },
    { m:  2400, color: 'rgb(0,210,160)' },
    { m:  3000, color: 'rgb(0,180,255)' },
    { m:  6000, color: 'rgb(0,90,255)' },
    { m:  9000, color: 'rgb(50,30,220)' },
    { m: 12200, color: 'rgb(140,0,210)' },
  ]
  const maxM = 12200
  const gradient = `linear-gradient(to right, ${colorStops.map(s => `${s.color} ${(s.m / maxM * 100).toFixed(1)}%`).join(', ')})`
  const ticks = [0, 600, 1500, 3000, 6000, 9000, 12000]

  return (
    <div className="alt-legend">
      <div className="alt-legend-title">ALTITUDE (m)</div>
      <div className="alt-legend-bar" style={{ background: gradient }} />
      <div className="alt-legend-labels">
        {ticks.map((m, i) => (
          <span key={m} style={{ left: `${(m / maxM * 100).toFixed(1)}%` }}>
            {m === 0 ? '0' : m >= 1000 ? `${m / 1000}k` : m}
            {i === ticks.length - 1 ? '+' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
