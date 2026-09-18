import { useEffect, useMemo, useRef } from 'react'
import { Marker, Polygon } from 'react-leaflet'
import L from 'leaflet'
import { MIL_RANGES_PL } from '../data/milRanges'
import { RANGE } from '../lib/palette'

export const RANGE_COLOR = RANGE

// Poligony są duże, więc ich podpisy mają sens wcześniej niż podpisy lotnisk
// (te pojawiają się od 8). Niżej niż 7 nazwy zlewałyby się w kaszę nad całą Polską.
const RANGE_LABEL_ZOOM = 7

// Powyżej tego przybliżenia kafelki OSM rysują już własną nazwę ośrodka i oba
// napisy nachodziły na siebie. Dotyczy wyłącznie podkładów, które faktycznie
// podpisują obszary — na satelicie i płótnach Esri nasz podpis zostaje, bo
// tam nie ma żadnej alternatywy.
const RANGE_LABEL_MAX_ZOOM = 10

// Poligony wojskowe — warstwa STAŁA, w odróżnieniu od warstwy ryzyka, która
// jest wyliczana na bieżąco. Obie bywają czerwone, więc poligon dostaje ukośne
// kreskowanie (tak mapy lotnicze znaczą strefy niebezpieczne), a województwo
// pod zagrożeniem gładkie wypełnienie. Bez tego przy poziomie „wysokim" nie
// dałoby się odróżnić, co jest stałym terenem ćwiczeń, a co bieżącą oceną.
//
// Nieinteraktywne, jak warstwa ryzyka: kliknięcie w mapę ma odznaczać maszynę,
// a nie trafiać w tło.
// Podpisy nie mają osobnego przełącznika — idą razem z warstwą.
export default function MilRangesLayer({ show, zoom, basemapLabelsAreas }) {
  // Środek podpisu liczymy raz: to centroid NAJWIĘKSZEGO płatu, nie całości —
  // przy poligonie rozbitym na kilka kawałków (Nowa Dęba ma cztery) środek
  // wszystkich razem potrafi wypaść w polu między nimi.
  const labels = useMemo(() => MIL_RANGES_PL.map(r => ({
    name: r.name,
    km2: r.km2,
    center: centroid(r.rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a))),
  })), [])

  if (!show) return null

  const labelsVisible = zoom >= RANGE_LABEL_ZOOM
    && !(basemapLabelsAreas && zoom > RANGE_LABEL_MAX_ZOOM)

  return (
    <>
      {MIL_RANGES_PL.flatMap(range =>
        range.rings.map((ring, i) => (
          <HatchedPolygon key={`${range.name}-${i}`} positions={ring} />
        ))
      )}

      {labelsVisible && labels.map(l => (
        <Marker
          key={l.name}
          position={l.center}
          interactive={false}
          keyboard={false}
          zIndexOffset={-900}
          icon={L.divIcon({
            className: 'range-marker',
            html: `<span class="range-marker-label">${l.name}<span class="range-marker-km">${l.km2} km²</span></span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
        />
      ))}
    </>
  )
}

// Pole pierścienia w mierze płaskiej — służy tylko do porównania płatów między
// sobą, więc nie potrzebuje przeliczenia na kilometry.
function ringArea(ring) {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLon] = ring[i]
    const [bLat, bLon] = ring[(i + 1) % ring.length]
    s += aLon * bLat - bLon * aLat
  }
  return Math.abs(s) / 2
}

// Centroid wielokąta (nie średnia wierzchołków — ta ucieka w stronę gęściej
// opisanego fragmentu granicy i podpis lądowałby przy krawędzi).
function centroid(ring) {
  let a = 0, lat = 0, lon = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [y1, x1] = ring[i]
    const [y2, x2] = ring[i + 1]
    const f = x1 * y2 - x2 * y1
    a += f
    lon += (x1 + x2) * f
    lat += (y1 + y2) * f
  }
  if (a === 0) return ring[0]
  a *= 3
  return [lat / a, lon / a]
}

// Klasę CSS nadajemy WPROST na elemencie ścieżki, a nie przez
// `pathOptions.className`. Ta druga droga działała na serwerze deweloperskim i
// cicho przestawała w buildzie produkcyjnym — react-leaflet nie przekazywał
// `className` do Leafletu, więc poligony wychodziły pełną czerwienią zamiast
// kreskowania. Efekt bez tablicy zależności odtwarza klasę także wtedy, gdy
// Leaflet przebuduje ścieżkę (zmiana renderera, powrót warstwy).
// Ten sam mechanizm rysuje teren lotnisk (MilAirfieldAreasLayer) — inna klasa
// i kolor obrysu, reszta wspólna.
export function HatchedPolygon({ positions, className = 'mil-range', color = RANGE_COLOR }) {
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.getElement?.()?.classList.add(className)
  })

  return (
    <Polygon
      ref={ref}
      positions={positions}
      interactive={false}
      pathOptions={{ color, weight: 1.2, opacity: 0.85 }}
    />
  )
}

// Definicja wzoru kreskowania. Renderowana raz, poza mapą — Leaflet ustawia
// `fill` atrybutem, a reguła CSS `.mil-range` go nadpisuje (CSS wygrywa
// z atrybutem prezentacyjnym), więc wzór trafia na wszystkie wielokąty warstwy.
export function MilRangeHatchDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false"
      style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>
        {/* Skok wzoru jest w pikselach EKRANU, nie w metrach terenu, więc przy
            mocnym przybliżeniu duży poligon wypełnia się setkami kresek i robi
            się z tego jednolita plama. Stąd rzadziej i bledziej, niż podpowiada
            intuicja przy oglądaniu całej Polski. */}
        <pattern id="milRangeHatch" width="10" height="10"
          patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="rgba(232, 116, 28, 0.07)" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(232, 116, 28, 0.45)" strokeWidth="1.8" />
        </pattern>
        {/* Teren lotnisk: to samo kreskowanie w kolorach warstw baz. Lotnisko
            jest małe, więc kreska gęściej niż na poligonie. */}
        <pattern id="baseAreaHatchPl" width="6" height="6"
          patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="rgba(47, 95, 208, 0.10)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(47, 95, 208, 0.6)" strokeWidth="1.6" />
        </pattern>
        <pattern id="baseAreaHatchNato" width="6" height="6"
          patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="rgba(109, 149, 184, 0.08)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(109, 149, 184, 0.5)" strokeWidth="1.6" />
        </pattern>
      </defs>
    </svg>
  )
}
