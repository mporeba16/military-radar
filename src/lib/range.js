// Suwak zasięgu alertów. Kotwice rozmieszczone równo (co 1/3 toru), a między
// nimi interpolacja liniowa — etykiety 25/100/250/500 trafiają dokładnie w
// swoje pozycje, a dolny zakres (25–100 km, najczęściej używany) dostaje
// proporcjonalnie więcej skoku suwaka niż rzadziej ruszany górny.
// Wydzielone z SettingsPanel, żeby dało się je testować bez renderu Reacta.
export const RANGE_ANCHORS = [25, 100, 250, 500]
export const RANGE_SEG = 100  // szerokość pozycji suwaka przypadająca na jeden segment

export function rangePosToKm(pos) {
  const seg = Math.min(Math.floor(pos / RANGE_SEG), RANGE_ANCHORS.length - 2)
  const f = (pos - seg * RANGE_SEG) / RANGE_SEG
  const km = RANGE_ANCHORS[seg] + (RANGE_ANCHORS[seg + 1] - RANGE_ANCHORS[seg]) * f
  const step = km < 100 ? 5 : km < 250 ? 10 : 25  // zaokrąglenie do „ładnych" wartości
  return Math.round(km / step) * step
}

export function rangeKmToPos(km) {
  for (let i = 0; i < RANGE_ANCHORS.length - 1; i++) {
    const lo = RANGE_ANCHORS[i], hi = RANGE_ANCHORS[i + 1]
    if (km <= hi || i === RANGE_ANCHORS.length - 2) {
      return Math.round((i + (km - lo) / (hi - lo)) * RANGE_SEG)
    }
  }
  return 0
}
