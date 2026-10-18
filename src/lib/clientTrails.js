// Trasy zbierane w aplikacji z kolejnych odświeżeń mapy — uzupełnienie tras
// z serwera (te zbiera cron co 2 min, a tu punkt jest co 10 s).
import { MLAT_MIN_INTERVAL_MS } from './trailFilter.js'

export const TRAIL_MIN_INTERVAL_MS = 10_000
export const TRAIL_MAX_AGE_MS = 60 * 60 * 1000          // godzina wstecz
export const TRAIL_FLIGHT_SPLIT_GAP_MS = 10 * 60 * 1000  // dłuższa przerwa = nowy lot

/**
 * Dopisuje bieżące pozycje do tras w `trails` (Map hex → punkty) i usuwa
 * trasy maszyn, których nie ma już w danych. Maszyny na ziemi nie dostają
 * punktów — trasa ma pokazywać tylko bieżący lot, a przerwa pozwala
 * serwerowi rozpoznać granicę między lotami. MLAT (pozycja z sieci
 * odbiorników) zapisujemy rzadziej i z flagą `m` — odskoki w bok odsiewa
 * filterMlatSpikes przy rysowaniu.
 */
export function updateClientTrails(trails, aircraft, now = Date.now()) {
  for (const ac of aircraft) {
    if (ac.lat == null || ac.lon == null || ac.on_ground) continue
    let fresh = (trails.get(ac.hex) || []).filter(p => now - p.ts < TRAIL_MAX_AGE_MS)
    const last = fresh[fresh.length - 1]
    if (last && now - last.ts > TRAIL_FLIGHT_SPLIT_GAP_MS) fresh = []
    const lastFresh = fresh[fresh.length - 1]
    const minInterval = ac.mlat ? MLAT_MIN_INTERVAL_MS : TRAIL_MIN_INTERVAL_MS
    if (!lastFresh || now - lastFresh.ts >= minInterval) {
      fresh.push({ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro, ts: now, ...(ac.mlat ? { m: 1 } : {}) })
    }
    trails.set(ac.hex, fresh)
  }
  const current = new Set(aircraft.map(a => a.hex))
  for (const hex of trails.keys()) if (!current.has(hex)) trails.delete(hex)
}
