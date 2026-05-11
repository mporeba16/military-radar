import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Circle, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
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

// F2: scale aircraft icons with zoom — clamped so they stay readable
function iconScaleForZoom(z) {
  // zoom 4 → 0.70, zoom 7 → 0.95, zoom 10 → 1.20, zoom 13+ → 1.45
  return Math.max(0.65, Math.min(1.5, 0.70 + (z - 4) * 0.085))
}

function buildIconSvg(ac, isSelected, inRange, zoomScale) {
  const hasTrack = ac.track != null
  const heading = hasTrack ? ac.track : 0
  const altM = ftToM(ac.alt_baro)
  const color = isSelected ? '#ffffff' : altToColor(altM)
  const shapeKey = getShapeKey(ac.t, ac.gs)
  const shape = SHAPES[shapeKey] || SHAPES.jet_swept

  const { cx, cy, scale, sz = 44 } = shape
  const effectiveSz = Math.round(sz * zoomScale)
  const half = effectiveSz / 2
  const paths = Array.isArray(shape.path) ? shape.path : [shape.path]
  // Combine drawing transform with zoom scale
  const tx = `scale(${scale * zoomScale}) translate(${-cx} ${-cy})`

  const mainPaths = paths.map(d =>
    `<path d="${d}" fill="${color}" stroke="rgba(0,0,0,0.55)" stroke-width="${0.7 / (scale * zoomScale)}" stroke-linejoin="round"/>`
  ).join('')
  const shadowPaths = paths.map(d => `<path d="${d}" fill="rgba(0,0,0,0.4)"/>`).join('')
  const ringR = Math.min(16 * zoomScale, half - 2)
  const selectionRing = isSelected
    ? `<circle r="${ringR}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.9"/>`
    : ''
  const inRangeRing = inRange && !isSelected
    ? `<circle r="${ringR + 2}" fill="none" stroke="#ff5520" stroke-width="1.5" opacity="0.85"><animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.5s" repeatCount="indefinite"/></circle>`
    : ''
  const noTrackRing = !hasTrack
    ? `<circle r="${ringR - 3}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1" stroke-dasharray="2 2"/>`
    : ''

  // U16: enlarge tap target — invisible circle with iconSize.
  // overflow="visible" lets the shape render outside the bounding box.
  const tapPad = 6
  const hitR = half + tapPad
  const hitArea = `<circle r="${hitR}" fill="rgba(0,0,0,0)"/>`

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${effectiveSz + tapPad * 2}" height="${effectiveSz + tapPad * 2}" viewBox="-${hitR} -${hitR} ${hitR * 2} ${hitR * 2}" overflow="visible">
      ${hitArea}
      <g transform="translate(1.2,1.2)">
        <g transform="rotate(${heading})"><g transform="${tx}">${shadowPaths}</g></g>
      </g>
      <g transform="rotate(${heading})">
        <g transform="${tx}">${mainPaths}</g>
      </g>
      ${inRangeRing}
      ${noTrackRing}
      ${selectionRing}
    </svg>`
}

function buildLeafletIcon(ac, isSelected, inRange, zoomScale) {
  const shape = SHAPES[getShapeKey(ac.t, ac.gs)] || SHAPES.jet_swept
  const sz = shape.sz || 44
  const tapPad = 6
  const totalSz = Math.round(sz * zoomScale) + tapPad * 2
  const half = totalSz / 2
  return L.divIcon({
    html: buildIconSvg(ac, isSelected, inRange, zoomScale),
    iconSize: [totalSz, totalSz],
    iconAnchor: [half, half],
    className: '',
  })
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

function ZoomTracker({ onZoomChange }) {
  const map = useMap()
  useEffect(() => {
    onZoomChange(map.getZoom())
    const handler = () => onZoomChange(map.getZoom())
    map.on('zoomend', handler)
    return () => { map.off('zoomend', handler) }
  }, [map, onZoomChange])
  return null
}

function CenterOnGps({ token, gpsCenter }) {
  const map = useMap()
  const lastToken = useRef(0)
  useEffect(() => {
    if (!token || token === lastToken.current) return
    lastToken.current = token
    if (gpsCenter) {
      map.flyTo(gpsCenter, Math.max(map.getZoom(), 9), { duration: 0.6 })
    }
  }, [token, gpsCenter, map])
  return null
}

function AircraftLayer({ aircraft, selectedHex, inRangeHexes, onSelect, zoomScale }) {
  const map = useMap()
  const groupRef = useRef(null)
  const markersRef = useRef(new Map()) // hex → { marker, key }

  // Initialize cluster group once
  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      disableClusteringAtZoom: 10,
      maxClusterRadius: 35,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div class="ac-cluster">${count}</div>`,
          className: 'ac-cluster-wrap',
          iconSize: [34, 34],
        })
      },
    })
    map.addLayer(group)
    groupRef.current = group
    return () => {
      map.removeLayer(group)
      groupRef.current = null
      markersRef.current.clear()
    }
  }, [map])

  // Sync markers — only update what's changed
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const next = new Set()
    const additions = []
    const removals = []

    for (const ac of aircraft) {
      if (ac.lat == null || ac.lon == null) continue
      next.add(ac.hex)
      const isSelected = ac.hex === selectedHex
      const inRange = !!inRangeHexes?.has(ac.hex)
      const key = `${ac.lat.toFixed(5)}|${ac.lon.toFixed(5)}|${ac.track ?? 'na'}|${ac.alt_baro ?? 'na'}|${ac.gs ?? 'na'}|${ac.t || ''}|${isSelected ? 1 : 0}|${inRange ? 1 : 0}|${zoomScale}`

      const existing = markersRef.current.get(ac.hex)
      if (existing && existing.key === key) continue  // unchanged — keep marker

      if (existing) {
        // Position/icon changed — update in place
        if (existing.lastPos[0] !== ac.lat || existing.lastPos[1] !== ac.lon) {
          existing.marker.setLatLng([ac.lat, ac.lon])
          existing.lastPos = [ac.lat, ac.lon]
        }
        existing.marker.setIcon(buildLeafletIcon(ac, isSelected, inRange, zoomScale))
        existing.key = key
      } else {
        const marker = L.marker([ac.lat, ac.lon], {
          icon: buildLeafletIcon(ac, isSelected, inRange, zoomScale),
        })
        const hex = ac.hex
        marker.on('click', (e) => {
          if (e.originalEvent) e.originalEvent.stopPropagation()
          onSelect?.(hex)
        })
        markersRef.current.set(ac.hex, { marker, key, lastPos: [ac.lat, ac.lon] })
        additions.push(marker)
      }
    }

    for (const [hex, entry] of markersRef.current) {
      if (!next.has(hex)) {
        removals.push(entry.marker)
        markersRef.current.delete(hex)
      }
    }

    if (removals.length) group.removeLayers(removals)
    if (additions.length) group.addLayers(additions)
  }, [aircraft, selectedHex, inRangeHexes, zoomScale, onSelect])

  return null
}

export default function RadarMap({
  aircraft, trails, serverTrails, center, gpsCenter, radius,
  selectedHex, inRangeHexes, onSelect, activeTileId, centerOnGpsToken,
}) {
  const initialZoom = 5
  const [zoom, setZoom] = useState(initialZoom)
  const tileLayer = TILE_LAYERS.find(l => l.id === activeTileId) || TILE_LAYERS[0]
  const zoomScale = useMemo(() => iconScaleForZoom(zoom), [zoom])

  // Trail polylines for the selected aircraft only
  const trailSegments = useMemo(() => {
    if (!selectedHex) return null
    if (selectedHex.startsWith('__')) return null
    const clientPts = trails?.current?.get(selectedHex) || []
    const serverPts = serverTrails?.get(selectedHex) || []
    const clientTs = new Set(clientPts.map(p => p.ts))
    const merged = [...serverPts.filter(p => !clientTs.has(p.ts)), ...clientPts]
    merged.sort((a, b) => a.ts - b.ts)
    if (merged.length < 2) return null
    return merged.slice(1).map((pt, i) => ({
      key: `trail-${selectedHex}-${i}`,
      positions: [[merged[i].lat, merged[i].lon], [pt.lat, pt.lon]],
      color: altToColor(ftToM(pt.alt)),
    }))
  }, [selectedHex, trails, serverTrails, aircraft])  // aircraft included to refresh on poll

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
        <MapClickHandler onSelect={onSelect} />
        <TileFilter filter={tileLayer.filter} />
        <ZoomTracker onZoomChange={setZoom} />
        <CenterOnGps token={centerOnGpsToken} gpsCenter={gpsCenter} />

        {radius && gpsCenter && (
          <Circle center={gpsCenter} radius={radius * 1000} pathOptions={{
            color: '#00ff88', fillOpacity: 0, weight: 1.5, dashArray: '6 4',
          }} />
        )}

        {trailSegments && trailSegments.map(seg => (
          <Polyline key={seg.key} positions={seg.positions}
            pathOptions={{ color: seg.color, weight: 2.5, opacity: 0.85 }} />
        ))}

        <AircraftLayer
          aircraft={aircraft}
          selectedHex={selectedHex}
          inRangeHexes={inRangeHexes}
          onSelect={onSelect}
          zoomScale={zoomScale}
        />
      </MapContainer>

      <AltitudeLegend />
    </div>
  )
}

function AltitudeLegend() {
  const colorStops = [
    { m:     0, color: 'rgb(255,80,0)' },
    { m:   300, color: 'rgb(255,160,0)' },
    { m:   600, color: 'rgb(255,210,0)' },
    { m:  1200, color: 'rgb(255,255,0)' },
    { m:  1800, color: 'rgb(160,255,0)' },
    { m:  2400, color: 'rgb(0,220,50)' },
    { m:  3000, color: 'rgb(0,210,180)' },
    { m:  6000, color: 'rgb(0,130,255)' },
    { m:  9000, color: 'rgb(60,40,220)' },
    { m: 12200, color: 'rgb(180,0,210)' },
  ]
  const maxM = 12200
  const gradient = `linear-gradient(to right, ${colorStops.map(s => `${s.color} ${(s.m / maxM * 100).toFixed(1)}%`).join(', ')})`
  const ticks = [0, 1200, 3000, 6000, 9000, 12000]

  return (
    <div className="alt-legend">
      <div className="alt-legend-title">ALTITUDE (m)</div>
      <div className="alt-legend-bar" style={{ background: gradient }} />
      <div className="alt-legend-labels">
        {ticks.map((m, i) => (
          <span key={m} style={{ left: `${(m / maxM * 100).toFixed(1)}%` }}>
            {m === 0 ? 'GND' : m >= 1000 ? `${m / 1000}k` : m}
            {i === ticks.length - 1 ? '+' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
