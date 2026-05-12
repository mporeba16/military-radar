import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
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

// F2: scale aircraft icons with zoom — clamped so they stay readable
function iconScaleForZoom(z) {
  // zoom 4 → 0.70, zoom 7 → 0.95, zoom 10 → 1.20, zoom 13+ → 1.45
  return Math.max(0.65, Math.min(1.5, 0.70 + (z - 4) * 0.085))
}

// Minimum tap target diameter (px) — Apple HIG / Material guideline
const MIN_TAP_TARGET = 44

// T2: drop a point if there is another within DIST_M metres AND TIME_MS milliseconds.
// Client samples at ~15 s, server cron at ~120 s, so timestamps almost never
// match exactly — proximity-based dedup avoids zigzags from overlapping points.
const TRAIL_DEDUP_DIST_KM = 0.05
const TRAIL_DEDUP_TIME_MS = 30_000
function dedupTrailPoints(sortedPoints) {
  const out = []
  for (const p of sortedPoints) {
    const last = out[out.length - 1]
    if (last) {
      const dt = p.ts - last.ts
      if (dt >= 0 && dt < TRAIL_DEDUP_TIME_MS) {
        const dx = (p.lon - last.lon) * 111 * Math.cos(last.lat * Math.PI / 180)
        const dy = (p.lat - last.lat) * 111
        if (Math.sqrt(dx * dx + dy * dy) < TRAIL_DEDUP_DIST_KM) continue
      }
    }
    out.push(p)
  }
  return out
}

function buildIconSvg(ac, isSelected, zoomScale) {
  const onGround = !!ac.on_ground
  const hasTrack = ac.track != null
  const heading = hasTrack ? ac.track : 0
  const altM = ftToM(ac.alt_baro)
  const color = isSelected
    ? '#ffffff'
    : onGround
      ? '#808080'
      : altToColor(altM)
  const shapeKey = getShapeKey(ac.t, ac.gs)
  const shape = SHAPES[shapeKey] || SHAPES.jet_swept

  const { cx, cy, scale, sz = 44 } = shape
  const effectiveSz = Math.round(sz * zoomScale)
  const half = effectiveSz / 2
  const paths = Array.isArray(shape.path) ? shape.path : [shape.path]
  const tx = `scale(${scale * zoomScale}) translate(${-cx} ${-cy})`

  const mainPaths = paths.map(d =>
    `<path d="${d}" fill="${color}" stroke="rgba(0,0,0,0.55)" stroke-width="${0.7 / (scale * zoomScale)}" stroke-linejoin="round"/>`
  ).join('')
  const shadowPaths = paths.map(d => `<path d="${d}" fill="rgba(0,0,0,0.4)"/>`).join('')
  const ringR = Math.min(16 * zoomScale, half - 2)
  const selectionRing = isSelected
    ? `<circle r="${ringR}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.9"/>`
    : ''

  // S3: clamp tap padding so total target is always >= MIN_TAP_TARGET
  const tapPad = Math.max(6, Math.ceil((MIN_TAP_TARGET - effectiveSz) / 2))
  const hitR = half + tapPad
  const hitArea = `<circle r="${hitR}" fill="rgba(0,0,0,0)"/>`

  // V1: subtle desaturation when track is unknown (icon faces north by default)
  const groupOpacity = hasTrack ? 1 : 0.55

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${effectiveSz + tapPad * 2}" height="${effectiveSz + tapPad * 2}" viewBox="-${hitR} -${hitR} ${hitR * 2} ${hitR * 2}" overflow="visible">
      ${hitArea}
      <g opacity="${groupOpacity}">
        <g transform="translate(1.2,1.2)">
          <g transform="rotate(${heading})"><g transform="${tx}">${shadowPaths}</g></g>
        </g>
        <g transform="rotate(${heading})">
          <g transform="${tx}">${mainPaths}</g>
        </g>
      </g>
      ${selectionRing}
    </svg>`
}

function buildLeafletIcon(ac, isSelected, zoomScale) {
  const shape = SHAPES[getShapeKey(ac.t, ac.gs)] || SHAPES.jet_swept
  const sz = shape.sz || 44
  const effectiveSz = Math.round(sz * zoomScale)
  const tapPad = Math.max(6, Math.ceil((MIN_TAP_TARGET - effectiveSz) / 2))
  const totalSz = effectiveSz + tapPad * 2
  const half = totalSz / 2
  return L.divIcon({
    html: buildIconSvg(ac, isSelected, zoomScale),
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

function AircraftLayer({ aircraft, selectedHex, onSelect, zoomScale }) {
  const map = useMap()
  const groupRef = useRef(null)
  const markersRef = useRef(new Map()) // hex → { marker, key }

  // Initialize layer group once
  useEffect(() => {
    const group = L.layerGroup()
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
      // T1: split keys — position changes are cheap (setLatLng), icon changes
      // are expensive (full DOM rebuild via setIcon). Avoid setIcon when only
      // position changed.
      const posKey = `${ac.lat.toFixed(5)}|${ac.lon.toFixed(5)}`
      const iconKey = `${ac.track ?? 'na'}|${ac.alt_baro ?? 'na'}|${ac.gs ?? 'na'}|${ac.t || ''}|${isSelected ? 1 : 0}|${ac.on_ground ? 1 : 0}|${zoomScale}`

      const existing = markersRef.current.get(ac.hex)
      if (existing) {
        if (existing.posKey !== posKey) {
          existing.marker.setLatLng([ac.lat, ac.lon])
          existing.posKey = posKey
        }
        if (existing.iconKey !== iconKey) {
          existing.marker.setIcon(buildLeafletIcon(ac, isSelected, zoomScale))
          existing.iconKey = iconKey
        }
      } else {
        const marker = L.marker([ac.lat, ac.lon], {
          icon: buildLeafletIcon(ac, isSelected, zoomScale),
        })
        const hex = ac.hex
        marker.on('click', (e) => {
          if (e.originalEvent) e.originalEvent.stopPropagation()
          onSelect?.(hex)
        })
        markersRef.current.set(ac.hex, { marker, posKey, iconKey })
        additions.push(marker)
      }
    }

    for (const [hex, entry] of markersRef.current) {
      if (!next.has(hex)) {
        removals.push(entry.marker)
        markersRef.current.delete(hex)
      }
    }

    for (const m of removals) group.removeLayer(m)
    for (const m of additions) group.addLayer(m)
  }, [aircraft, selectedHex, zoomScale, onSelect])

  return null
}

export default function RadarMap({
  aircraft, trails, serverTrails, center, gpsCenter, radius,
  selectedHex, onSelect, activeTileId,
}) {
  const initialZoom = 6  // S4: was 5, but icons were too small at default view
  const [zoom, setZoom] = useState(initialZoom)
  const tileLayer = TILE_LAYERS.find(l => l.id === activeTileId) || TILE_LAYERS[0]
  const zoomScale = useMemo(() => iconScaleForZoom(zoom), [zoom])

  // Trail polylines for the selected aircraft only.
  // - T2: dedup by proximity (50 m / 30 s) instead of exact ts match
  // - T3: append the aircraft's current position so the trail visually reaches it
  // - T5: glue consecutive same-color points into one Polyline
  const { trailSegments, trailStart } = useMemo(() => {
    const empty = { trailSegments: null, trailStart: null }
    if (!selectedHex || selectedHex.startsWith('__')) return empty

    const clientPts = trails?.current?.get(selectedHex) || []
    const serverPts = serverTrails?.get(selectedHex) || []
    let all = [...serverPts, ...clientPts]
    all.sort((a, b) => a.ts - b.ts)
    all = dedupTrailPoints(all)

    // T3: stitch in the current aircraft position if newer than last trail point
    const selectedAc = aircraft.find(a => a.hex === selectedHex)
    if (selectedAc && selectedAc.lat != null && selectedAc.lon != null) {
      const now = Date.now()
      const last = all[all.length - 1]
      if (!last || now - last.ts > 5000) {
        all.push({ lat: selectedAc.lat, lon: selectedAc.lon, alt: selectedAc.alt_baro, ts: now })
      }
    }

    if (all.length < 2) return empty

    // T5: group consecutive same-color points into one Polyline
    const segments = []
    let curColor = null
    let curPositions = null
    for (const pt of all) {
      const c = altToColor(ftToM(pt.alt))
      const ll = [pt.lat, pt.lon]
      if (c === curColor) {
        curPositions.push(ll)
      } else {
        if (curPositions && curPositions.length >= 2) {
          segments.push({ key: `seg-${selectedHex}-${segments.length}`, color: curColor, positions: curPositions })
        }
        // Start new segment, including the last point of the previous segment
        // so transitions render without gaps
        curPositions = curPositions && curPositions.length > 0
          ? [curPositions[curPositions.length - 1], ll]
          : [ll]
        curColor = c
      }
    }
    if (curPositions && curPositions.length >= 2) {
      segments.push({ key: `seg-${selectedHex}-${segments.length}`, color: curColor, positions: curPositions })
    }

    return { trailSegments: segments, trailStart: { lat: all[0].lat, lon: all[0].lon } }
  }, [selectedHex, trails, serverTrails, aircraft])

  // V3: trail weight scales with zoom (thicker at higher zoom)
  const trailWeight = 1.5 + zoomScale * 1.6

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

        {radius && gpsCenter && (
          <Circle center={gpsCenter} radius={radius * 1000} pathOptions={{
            color: '#00ff88', fillOpacity: 0, weight: 1.5, dashArray: '6 4',
          }} />
        )}

        {trailSegments && trailSegments.map(seg => (
          <Polyline key={seg.key} positions={seg.positions}
            pathOptions={{ color: seg.color, weight: trailWeight, opacity: 0.85 }} />
        ))}

        {/* V2: green dot at the trail start, so direction is visible at a glance */}
        {trailStart && (
          <CircleMarker
            center={[trailStart.lat, trailStart.lon]}
            radius={4}
            pathOptions={{ color: '#00ff88', fillColor: '#00ff88', fillOpacity: 0.9, weight: 2 }}
          />
        )}

        <AircraftLayer
          aircraft={aircraft}
          selectedHex={selectedHex}
          onSelect={onSelect}
          zoomScale={zoomScale}
        />
      </MapContainer>
    </div>
  )
}

export function AltitudeLegend() {
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
      <div className="alt-legend-bar" style={{ background: gradient }} />
      <div className="alt-legend-labels">
        {ticks.map((m, i) => (
          <span key={m} style={{ left: `${(m / maxM * 100).toFixed(1)}%` }}>
            {m === 0 ? 'GND' : m >= 1000 ? `${m / 1000}k` : m}
            {i === ticks.length - 1 ? '+' : ''}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>w metrach (m)</div>
    </div>
  )
}
