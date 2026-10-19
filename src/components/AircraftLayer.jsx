// Warstwa samolotów: ikony (sylwetka, kolor wysokości, znaczniki), płynny
// ruch między odświeżeniami i rysowanie tylko tego, co jest w widoku.
// Leaflet bezpośrednio, nie komponenty react-leaflet — przy kilkuset
// znacznikach odświeżanych co 10 s to rząd wielkości taniej.
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { SHAPES, getShapeKey } from './aircraftShapes'
import { buildIconSvg, MIN_TAP_TARGET, squawkAlertColor } from './aircraftIcon'

// F2: scale aircraft icons with zoom — clamped so they stay readable
export function iconScaleForZoom(z) {
  // zoom 4 → 0.70, zoom 7 → 0.95, zoom 10 → 1.20, zoom 13+ → 1.45
  return Math.max(0.65, Math.min(1.5, 0.70 + (z - 4) * 0.085))
}

// Smooth marker animation: a single requestAnimationFrame loop interpolates
// every animating marker from old to new position over ~2.5 s instead of
// teleporting on each poll. This hides the 10-s-poll sampling step and
// smooths over small jumps in adsb.fi data.
// Animacja dobiega 2,5 s, ale przy tłoku na niebie skracamy ją: na telefonie
// płynne przesuwanie kilkuset ikon przez 2,5 s po każdym odświeżeniu zjadało
// więcej procesora niż wszystko inne razem wzięte.
const MARKER_ANIM_MS = 2500
const MARKER_ANIM_MS_BUSY = 1000
const BUSY_MARKERS = 150
let markerAnimMs = MARKER_ANIM_MS
const animatingMarkers = new Map() // marker → { fromLat, fromLon, toLat, toLon, startTime }
let animRafId = null
function tickMarkerAnimations() {
  const now = performance.now()
  for (const [marker, a] of animatingMarkers) {
    const t = Math.min(1, (now - a.startTime) / a.durationMs)
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
    durationMs: markerAnimMs,
    fromLat: from.lat, fromLon: from.lng, toLat, toLon,
    startTime: performance.now(),
  })
  if (animRafId == null) animRafId = requestAnimationFrame(tickMarkerAnimations)
}

// Display-time implausibility filter: if the implied speed between the
// previous and the new position exceeds this threshold, keep the previous
// position (treat as a data glitch; next poll usually corrects itself).
const DISPLAY_MAX_PLAUSIBLE_KMH = 3000

function buildLeafletIcon(ac, isSelected, zoomScale) {
  const shape = SHAPES[getShapeKey(ac.t, ac.gs, ac.category)] || SHAPES.jet_swept
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

// Zapas wokół widoku: znacznik tuż za krawędzią ma już swój marker, więc
// przy przesuwaniu mapy nic nie „doskakuje" z opóźnieniem.
const VIEW_PAD = 0.35

export default function AircraftLayer({ aircraft, selectedHex, onSelect, zoomScale, viewTick }) {
  const map = useMap()
  const groupRef = useRef(null)
  const markersRef = useRef(new Map()) // hex → { marker, key }

  // Initialize layer group once
  useEffect(() => {
    const group = L.layerGroup()
    map.addLayer(group)
    groupRef.current = group
    const markers = markersRef.current
    return () => {
      for (const entry of markers.values()) {
        animatingMarkers.delete(entry.marker)
      }
      map.removeLayer(group)
      groupRef.current = null
      markers.clear()
    }
  }, [map])

  // Sync markers — only update what's changed
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const next = new Set()
    const additions = []
    const removals = []

    // Rysujemy tylko to, co widać (plus zapas). Przy 400 maszynach nad Europą
    // 78% znaczników było poza ekranem, a mimo to miały swój węzeł w drzewie
    // strony i były animowane co klatkę.
    const view = map.getBounds().pad(VIEW_PAD)
    const inView = ac => view.contains([ac.lat, ac.lon]) || ac.hex === selectedHex
    const shown = aircraft.filter(ac =>
      ac.lat != null && ac.lon != null &&
      Number.isFinite(ac.lat) && Number.isFinite(ac.lon) && inView(ac))
    markerAnimMs = shown.length > BUSY_MARKERS ? MARKER_ANIM_MS_BUSY : MARKER_ANIM_MS

    for (const ac of shown) {
      next.add(ac.hex)
      const isSelected = ac.hex === selectedHex
      // T1: split keys — position changes are cheap (setLatLng), icon changes
      // are expensive (full DOM rebuild via setIcon). Avoid setIcon when only
      // position changed.
      const posKey = `${ac.lat.toFixed(5)}|${ac.lon.toFixed(5)}`
      // Quantize track (5°) and altitude (200 ft) so a slowly climbing /
      // turning aircraft doesn't rebuild its DOM every 10 s.
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
  }, [aircraft, selectedHex, zoomScale, onSelect, map, viewTick])

  return null
}
