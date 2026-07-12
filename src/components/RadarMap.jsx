import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './RadarMap.css'
import { SHAPES, getShapeKey, altToColor, ftToM } from './aircraftShapes'
import { MIL_BASES_PL } from '../airfields'
import { t } from '../i18n'

// Note: no L.Icon.Default config — every marker here is a custom L.divIcon,
// so the default marker/shadow images are never used (removing it also drops
// the only hardcoded unpkg CDN dependency).

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

// Smooth marker animation: a single requestAnimationFrame loop interpolates
// every animating marker from old to new position over ~2.5 s instead of
// teleporting on each poll. This hides the 5-s-poll sampling step and
// smooths over small jumps in adsb.fi data.
const MARKER_ANIM_MS = 2500
const animatingMarkers = new Map() // marker → { fromLat, fromLon, toLat, toLon, startTime }
let animRafId = null
function tickMarkerAnimations() {
  const now = performance.now()
  for (const [marker, a] of animatingMarkers) {
    const t = Math.min(1, (now - a.startTime) / MARKER_ANIM_MS)
    const eased = 1 - Math.pow(1 - t, 2)  // easeOutQuad
    const lat = a.fromLat + (a.toLat - a.fromLat) * eased
    const lon = a.fromLon + (a.toLon - a.fromLon) * eased
    marker.setLatLng([lat, lon])
    if (t >= 1) animatingMarkers.delete(marker)
  }
  animRafId = animatingMarkers.size > 0 ? requestAnimationFrame(tickMarkerAnimations) : null
}
function animateMarkerTo(marker, toLat, toLon) {
  const from = marker.getLatLng()
  animatingMarkers.set(marker, {
    fromLat: from.lat, fromLon: from.lng, toLat, toLon,
    startTime: performance.now(),
  })
  if (animRafId == null) animRafId = requestAnimationFrame(tickMarkerAnimations)
}

// Display-time implausibility filter: if the implied speed between the
// previous and the new position exceeds this threshold, keep the previous
// position (treat as a data glitch; next poll usually corrects itself).
const DISPLAY_MAX_PLAUSIBLE_KMH = 3000

// Trail rendering: don't draw a polyline segment across a gap larger than
// this (e.g. signal loss over open water). The two real points stay at
// their true positions; the bogus straight bridge between them does not.
const TRAIL_VISUAL_GAP_MS = 3 * 60 * 1000

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

// Specjalne kody transpondera = „coś jest nie tak" — sygnalizujemy je
// wykrzyknikiem przy ikonie, żeby było widać bez klikania w kartę.
//   7500 porwanie, 7700 emergency  → czerwony
//   7600 brak łączności, 7400 utrata UAV → bursztynowy
const SQUAWK_ALERT_COLOR = { '7500': '#ff1e1e', '7700': '#ff1e1e', '7600': '#ffae00', '7400': '#ffae00' }
function squawkAlertColor(squawk) {
  if (squawk == null) return null
  return SQUAWK_ALERT_COLOR[String(squawk).padStart(4, '0')] || null
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
  // Zaznaczenie: ciemne tło (czytelne na jasnej mapie/satelicie) + jaskrawy
  // zielony pierścień + rozszerzający się, zanikający puls — od razu widać,
  // którą maszynę kliknięto, nawet w gęstym ruchu.
  const selPulseR = ringR + 11
  const selectionRing = isSelected
    ? `<circle r="${ringR}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="4.5"/>
       <circle r="${ringR}" fill="none" stroke="#00ff88" stroke-width="2.5"/>
       <circle r="${ringR}" fill="none" stroke="#00ff88" stroke-width="2" opacity="0.7">
         <animate attributeName="r" from="${ringR}" to="${selPulseR}" dur="1.4s" repeatCount="indefinite"/>
         <animate attributeName="opacity" from="0.7" to="0" dur="1.4s" repeatCount="indefinite"/>
       </circle>`
    : ''
  // Kategorie poza wojskiem dostają kolorową obwódkę, by wyróżniały się na mapie
  // (wojsko = bazowy wygląd bez obwódki). Pomijamy gdy ikona jest zaznaczona.
  const KIND_RING = { heli: '#00d9ff', heavy: '#ffb300' }
  const kindRingColor = !isSelected ? KIND_RING[ac.kind] : null
  const kindRing = kindRingColor
    ? `<circle r="${ringR}" fill="none" stroke="${kindRingColor}" stroke-width="2" opacity="0.85"/>`
    : ''

  // S3: clamp tap padding so total target is always >= MIN_TAP_TARGET
  const tapPad = Math.max(6, Math.ceil((MIN_TAP_TARGET - effectiveSz) / 2))
  const hitR = half + tapPad
  const hitArea = `<circle r="${hitR}" fill="rgba(0,0,0,0)"/>`

  // V1: subtle desaturation when track is unknown (icon faces north by default)
  const groupOpacity = hasTrack ? 1 : 0.55

  // Wykrzyknik dla maszyn z alarmowym squawkiem (7500/7600/7700/7400) — w prawym
  // górnym rogu ikony, NIE obraca się z dziobem (to oznaczenie UI, nie część maszyny).
  const alertColor = squawkAlertColor(ac.squawk)
  const badgeR = Math.max(5.5, 6.5 * zoomScale)
  const alertBadge = alertColor
    ? `<g transform="translate(${ringR},${-ringR})">
         <circle r="${badgeR}" fill="${alertColor}" stroke="#ffffff" stroke-width="1.3"/>
         <text x="0" y="0" font-size="${badgeR * 1.5}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif">!</text>
       </g>`
    : ''

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
      ${kindRing}
      ${selectionRing}
      ${alertBadge}
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

// Statyczna warstwa polskich baz wojskowych (Łask, Krzesiny…). Rysowana POD
// samolotami (zIndexOffset ujemny), bursztynowym kwadratem. Nazwa pokazuje się
// dopiero od zoomu LABEL_ZOOM, żeby przy oddaleniu nie zaśmiecać mapy napisami.
const BASE_LABEL_ZOOM = 8
function BasesLayer({ zoom }) {
  const map = useMap()
  const groupRef = useRef(null)

  useEffect(() => {
    const group = L.layerGroup()
    map.addLayer(group)
    groupRef.current = group
    return () => { map.removeLayer(group); groupRef.current = null }
  }, [map])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clearLayers()
    const showLabel = zoom >= BASE_LABEL_ZOOM
    for (const ap of MIL_BASES_PL) {
      const label = showLabel
        ? `<span class="base-marker-label">${ap.name}<span class="base-marker-icao">${ap.icao}</span></span>`
        : ''
      const icon = L.divIcon({
        className: 'base-marker',
        html: `<span class="base-marker-sq"></span>${label}`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      })
      const m = L.marker([ap.lat, ap.lon], { icon, zIndexOffset: -1000, keyboard: false })
      m.bindTooltip(`${ap.name} · ${ap.icao}`, { direction: 'top', offset: [0, -8], className: 'base-tooltip' })
      group.addLayer(m)
    }
  }, [zoom])

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
      for (const entry of markersRef.current.values()) {
        animatingMarkers.delete(entry.marker)
      }
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
      if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) continue
      next.add(ac.hex)
      const isSelected = ac.hex === selectedHex
      // T1: split keys — position changes are cheap (setLatLng), icon changes
      // are expensive (full DOM rebuild via setIcon). Avoid setIcon when only
      // position changed.
      const posKey = `${ac.lat.toFixed(5)}|${ac.lon.toFixed(5)}`
      // Quantize track (5°) and altitude (200 ft) so a slowly climbing /
      // turning aircraft doesn't rebuild its DOM every 5 s.
      const trackQ = ac.track != null ? Math.round(ac.track / 5) : 'na'
      const altQ = ac.alt_baro != null ? Math.round(ac.alt_baro / 200) : 'na'
      const v22Slow = /V22|MV22|CV22|OSPREY/i.test(ac.t || '') && ac.gs != null && ac.gs < 100 ? 1 : 0
      const iconKey = `${trackQ}|${altQ}|${v22Slow}|${ac.t || ''}|${ac.kind || ''}|${squawkAlertColor(ac.squawk) || ''}|${isSelected ? 1 : 0}|${ac.on_ground ? 1 : 0}|${zoomScale}`

      const existing = markersRef.current.get(ac.hex)
      if (existing) {
        if (existing.posKey !== posKey) {
          // Plausibility check — reject teleports
          const prev = existing.marker.getLatLng()
          const dtSec = existing.lastUpdateTs
            ? (Date.now() - existing.lastUpdateTs) / 1000
            : 0
          let plausible = true
          if (dtSec > 0 && dtSec < 60) {
            const dx = (ac.lon - prev.lng) * 111 * Math.cos(prev.lat * Math.PI / 180)
            const dy = (ac.lat - prev.lat) * 111
            const distKm = Math.sqrt(dx * dx + dy * dy)
            const impliedKmh = distKm / (dtSec / 3600)
            if (impliedKmh > DISPLAY_MAX_PLAUSIBLE_KMH) plausible = false
          }
          if (plausible) {
            animateMarkerTo(existing.marker, ac.lat, ac.lon)
            existing.posKey = posKey
            existing.lastUpdateTs = Date.now()
          }
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
        markersRef.current.set(ac.hex, { marker, posKey, iconKey, lastUpdateTs: Date.now() })
        additions.push(marker)
      }
    }

    for (const [hex, entry] of markersRef.current) {
      if (!next.has(hex)) {
        removals.push(entry.marker)
        markersRef.current.delete(hex)
      }
    }

    for (const m of removals) {
      animatingMarkers.delete(m)
      group.removeLayer(m)
    }
    for (const m of additions) group.addLayer(m)
  }, [aircraft, selectedHex, zoomScale, onSelect])

  return null
}

export default function RadarMap({
  aircraft, hasFetched, trails, serverTrails, center, gpsCenter, radius,
  selectedHex, onSelect, activeTileId, showBases,
}) {
  const initialZoom = 6  // S4: was 5, but icons were too small at default view
  const [zoom, setZoom] = useState(initialZoom)
  const tileLayer = TILE_LAYERS.find(l => l.id === activeTileId) || TILE_LAYERS[0]
  const zoomScale = useMemo(() => iconScaleForZoom(zoom), [zoom])
  const mapRef = useRef(null)

  // Mapa startuje na środku Europy (żeby było widać cały kraj). Ten przycisk
  // pojawia się dopiero, gdy mamy GPS, i przelatuje kamerą do pozycji użytkownika.
  const recenter = () => {
    const map = mapRef.current
    if (!map || !gpsCenter) return
    map.flyTo(gpsCenter, Math.max(map.getZoom(), 9), { duration: 0.6 })
  }

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

    // T5 + visual gap cut: group consecutive same-color points into one
    // Polyline. If two consecutive points are separated by more than
    // TRAIL_VISUAL_GAP_MS (signal-loss period), DON'T draw a bridge line
    // between them — start a fresh segment instead. This stops the trail
    // from showing a long straight line across data outages.
    const segments = []
    let curColor = null
    let curPositions = null
    let lastPt = null
    const flush = () => {
      if (curPositions && curPositions.length >= 2) {
        segments.push({ key: `seg-${selectedHex}-${segments.length}`, color: curColor, positions: curPositions })
      }
    }
    for (const pt of all) {
      const c = altToColor(ftToM(pt.alt))
      const ll = [pt.lat, pt.lon]
      const gapTooBig = lastPt && (pt.ts - lastPt.ts > TRAIL_VISUAL_GAP_MS)
      if (gapTooBig) {
        // Close current segment; start the next one fresh — NO bridge.
        flush()
        curPositions = [ll]
        curColor = c
      } else if (c === curColor) {
        curPositions.push(ll)
      } else {
        flush()
        // Color transition — bridge with previous point for continuity.
        curPositions = curPositions && curPositions.length > 0
          ? [curPositions[curPositions.length - 1], ll]
          : [ll]
        curColor = c
      }
      lastPt = pt
    }
    flush()

    return { trailSegments: segments, trailStart: { lat: all[0].lat, lon: all[0].lon } }
  }, [selectedHex, trails, serverTrails, aircraft])

  // V3: trail weight scales with zoom (thicker at higher zoom)
  const trailWeight = 1.5 + zoomScale * 1.6

  // Only show "no aircraft" message AFTER the first fetch completes —
  // before that, the empty array is just "we haven't loaded yet".
  const showEmpty = hasFetched && aircraft.length === 0
  const showLoading = !hasFetched

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {showLoading && (
        <div className="map-empty-state" role="status">
          {t('LOADING_AIRCRAFT')}
        </div>
      )}
      {showEmpty && (
        <div className="map-empty-state" role="status">
          {t('NO_AIRCRAFT')}
        </div>
      )}
      {gpsCenter && (
        <button
          className="map-recenter-btn"
          onClick={recenter}
          aria-label={t('RECENTER_GPS')}
          title={t('RECENTER_GPS')}
        >
          ◎
        </button>
      )}
      <MapContainer
        ref={mapRef}
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

        {showBases && <BasesLayer zoom={zoom} />}

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
            {i === ticks.length - 1 ? 'm+' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
