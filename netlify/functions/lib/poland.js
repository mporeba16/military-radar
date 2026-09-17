// Obrys granic Polski i test punktu — jedno miejsce dla wszystkich, którzy
// pytają „czy to leci nad Polską". Wyjęte z aircraft.js, gdy okazało się, że
// model ryzyka liczył maszyny w PROSTOKĄCIE wokół Polski i do „maszyn nad
// Polską" wliczał trzy samoloty nad Czechami. Ten plik istnieje po to, żeby
// druga odpowiedź na to samo pytanie nie mogła powstać obok pierwszej.

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
