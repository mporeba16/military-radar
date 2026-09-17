import { useEffect, useRef } from 'react'
import { Polygon } from 'react-leaflet'
import { MIL_RANGES_PL } from '../data/milRanges'

export const RANGE_COLOR = '#ff3b30'

// Poligony wojskowe — warstwa STAŁA, w odróżnieniu od warstwy ryzyka, która
// jest wyliczana na bieżąco. Obie bywają czerwone, więc poligon dostaje ukośne
// kreskowanie (tak mapy lotnicze znaczą strefy niebezpieczne), a województwo
// pod zagrożeniem gładkie wypełnienie. Bez tego przy poziomie „wysokim" nie
// dałoby się odróżnić, co jest stałym terenem ćwiczeń, a co bieżącą oceną.
//
// Nieinteraktywne, jak warstwa ryzyka: kliknięcie w mapę ma odznaczać maszynę,
// a nie trafiać w tło.
export default function MilRangesLayer({ show }) {
  if (!show) return null
  return (
    <>
      {MIL_RANGES_PL.flatMap(range =>
        range.rings.map((ring, i) => (
          <HatchedPolygon key={`${range.name}-${i}`} positions={ring} />
        ))
      )}
    </>
  )
}

// Klasę CSS nadajemy WPROST na elemencie ścieżki, a nie przez
// `pathOptions.className`. Ta druga droga działała na serwerze deweloperskim i
// cicho przestawała w buildzie produkcyjnym — react-leaflet nie przekazywał
// `className` do Leafletu, więc poligony wychodziły pełną czerwienią zamiast
// kreskowania. Efekt bez tablicy zależności odtwarza klasę także wtedy, gdy
// Leaflet przebuduje ścieżkę (zmiana renderera, powrót warstwy).
function HatchedPolygon({ positions }) {
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.getElement?.()?.classList.add('mil-range')
  })

  return (
    <Polygon
      ref={ref}
      positions={positions}
      interactive={false}
      pathOptions={{ color: RANGE_COLOR, weight: 1.2, opacity: 0.85 }}
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
          <rect width="10" height="10" fill="rgba(255, 59, 48, 0.055)" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(255, 59, 48, 0.4)" strokeWidth="1.8" />
        </pattern>
      </defs>
    </svg>
  )
}
