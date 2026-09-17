import { EAST_VOIVODESHIPS } from '../data/voivodeships'

// W którym z modelowanych województw leży punkt. Zwraca id albo null — null
// znaczy „model nie ma nic do powiedzenia o tym miejscu”, a nie „bezpiecznie”.
//
// Obrysy są uproszczone (tol. 0.025° ≈ 2,8 km), więc punkt tuż przy granicy
// województw może trafić do sąsiada. Dla alertu o ryzyku w skali województwa
// to bez znaczenia; nie używać tego do niczego, co wymaga dokładności.
export function regionIdAt(lat, lon) {
  if (lat == null || lon == null) return null
  for (const v of EAST_VOIVODESHIPS) {
    if (pointInRing(lat, lon, v.ring)) return v.id
  }
  return null
}

// Ray casting; pierścień trzyma punkty jako [lat, lon], więc x = lon, y = lat.
function pointInRing(lat, lon, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1]
    const yj = ring[j][0], xj = ring[j][1]
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}
