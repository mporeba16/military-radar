// Obrys granic Polski i test punktu — jedno miejsce dla wszystkich, którzy
// pytają „czy to leci nad Polską". Wyjęte z aircraft.js, gdy okazało się, że
// usunięty już model ryzyka dronowego liczył maszyny w PROSTOKĄCIE wokół
// Polski i do „maszyn nad Polską" wliczał trzy samoloty nad Czechami. Ten plik
// istnieje po to, żeby druga odpowiedź na to samo pytanie nie mogła powstać
// obok pierwszej.

// Przybliżony obrys granic Polski (z niewielkim zapasem ~10–20 km na
// pogranicze/podejścia), [lat, lon] zgodnie z ruchem wskazówek zegara.
// Prostokąt nie wystarczał — łapał Kaliningrad i okolice Pragi/Lwowa, bo leżą
// w zakresie szer./dł. geogr. Polski. Wielokąt + test punktu to eliminuje.
export const POLAND_POLY = [
  [54.6, 14.2],  // NW, wybrzeże (Świnoujście)
  [54.9, 16.3],  // wybrzeże środkowe
  [54.9, 18.9],  // Zatoka Gdańska
  [54.45, 20.6], // granica z Kaliningradem (poniżej miasta 54.7)
  [54.45, 22.9], // Suwałki / NE (granica z Litwą)
  [52.7, 23.9],  // wschód (granica z Białorusią, Białystok/Brześć)
  [50.8, 24.2],  // SE (granica z Ukrainą, Hrubieszów)
  [49.0, 22.9],  // SE róg (Bieszczady)
  [49.3, 19.8],  // południe (Tatry, granica ze Słowacją)
  [49.5, 18.5],  // południe (Cieszyn, granica z Czechami)
  [50.0, 17.0],  // SW (Opole/Nysa, Czechy)
  [50.6, 15.0],  // SW róg (Jelenia Góra)
  [51.0, 14.7],  // zachód (Zgorzelec/Görlitz)
  [52.8, 14.1],  // zachód (Odra, Słubice)
  [53.9, 14.1],  // NW (Szczecin)
]

// Test punktu w wielokącie (ray casting); lon = x, lat = y.
export function isInPoland(lat, lon) {
  if (lat == null || lon == null) return false
  let inside = false
  for (let i = 0, j = POLAND_POLY.length - 1; i < POLAND_POLY.length; j = i++) {
    const yi = POLAND_POLY[i][0], xi = POLAND_POLY[i][1]
    const yj = POLAND_POLY[j][0], xj = POLAND_POLY[j][1]
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// Odległość w km od obrysu Polski (0 nad Polską). Rzut równoodległościowy
// wokół punktu — przy ~100 km błąd jest pomijalny.
export function distanceToPolandKm(lat, lon) {
  if (lat == null || lon == null) return Infinity
  if (isInPoland(lat, lon)) return 0
  const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57
  let best = Infinity
  for (let i = 0, j = POLAND_POLY.length - 1; i < POLAND_POLY.length; j = i++) {
    const ax = (POLAND_POLY[j][1] - lon) * kx, ay = (POLAND_POLY[j][0] - lat) * ky
    const bx = (POLAND_POLY[i][1] - lon) * kx, by = (POLAND_POLY[i][0] - lat) * ky
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

export function isNearPoland(lat, lon, km) {
  return distanceToPolandKm(lat, lon) <= km
}

// Czy maszyna jest nad Polską albo — przy obecnym kursie i prędkości — wleci
// nad nią w ciągu `minutes`. Pozycję przesuwamy po linii kursu co `stepMin`
// minut i sprawdzamy obrys. Bez kursu albo prędkości (np. stoi na lotnisku
// za granicą) — tylko pozycja bieżąca.
export function willEnterPoland(a, minutes = 20, stepMin = 2) {
  if (isInPoland(a?.lat, a?.lon)) return true
  if (typeof a?.gs !== 'number' || typeof a?.track !== 'number' || a.gs < 50) return false
  const rad = (a.track * Math.PI) / 180
  const cosLat = Math.cos((a.lat * Math.PI) / 180)
  for (let t = stepMin; t <= minutes; t += stepMin) {
    const distNm = (a.gs * t) / 60
    const lat = a.lat + (distNm * Math.cos(rad)) / 60
    const lon = a.lon + (distNm * Math.sin(rad)) / (60 * cosLat)
    if (isInPoland(lat, lon)) return true
  }
  return false
}
