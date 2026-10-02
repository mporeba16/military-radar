// Punkty trasy z MLAT (pozycja wyliczana przez sieć odbiorników, gdy samolot nie
// nadaje własnej) bywają przesunięte o kilka kilometrów. Pojedynczy taki punkt
// to „szpila” — trasa skacze w bok i wraca. Wcześniej MLAT w ogóle nie był
// zapisywany, przez co transportowce, tankowce i AWACS-y (często tylko MLAT)
// nie miały trasy. Teraz zapisujemy go i odsiewamy tylko odskoki.

const R_KM = 6371

function km(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat = (((a.lat + b.lat) / 2) * Math.PI) / 180
  return R_KM * Math.hypot(dLat, dLon * Math.cos(lat))
}

function speedKmh(a, b) {
  const h = (b.ts - a.ts) / 3_600_000
  return h > 0 ? km(a, b) / h : 0
}

// Dolna mediana: każda szpila zawyża dwa odcinki naraz, więc przy krótkiej
// trasie zwykła mediana potrafi wypaść właśnie na odcinku przez szpilę.
function lowerMedian(values) {
  const v = values.filter(x => x > 0).sort((x, y) => x - y)
  return v.length ? v[Math.floor((v.length - 1) / 2)] : 0
}

/**
 * Usuwa punkty MLAT (`m: 1`), do których i z których samolot musiałby „lecieć”
 * wyraźnie szybciej niż na reszcie trasy (ponad 1,8× mediany), a objazd przez
 * punkt to co najmniej 3 km. Geometria sama nie wystarcza — nawrót samolotu
 * też jest objazdem, ale odbywa się z normalną prędkością. Punkty ADS-B (bez
 * `m`) zostają nietknięte. Wejście posortowane po czasie.
 */
export function filterMlatSpikes(points) {
  if (points.length < 3) return points
  const typical = lowerMedian(points.slice(1).map((p, i) => speedKmh(points[i], p)))
  if (!typical) return points
  const out = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]
    if (p.m) {
      const a = out[out.length - 1]
      const b = points[i + 1]
      const detour = km(a, p) + km(p, b) - km(a, b)
      const tooFast = speedKmh(a, p) > 1.8 * typical && speedKmh(p, b) > 1.8 * typical
      if (tooFast && detour > 3) continue
    }
    out.push(p)
  }
  out.push(points[points.length - 1])
  return out
}

/** Minimalny odstęp między punktami MLAT — rzadziej niż ADS-B, mniej drgań. */
export const MLAT_MIN_INTERVAL_MS = 30_000
