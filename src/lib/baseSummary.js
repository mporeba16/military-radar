// Treść dymka lotniska wojskowego: co dziś lata z tej bazy według planu PAŻP
// i co jest teraz w powietrzu w pobliżu. Czysta funkcja — dane wchodzą,
// struktura do wyświetlenia wychodzi; HTML składa mapa.

import { haversine } from './geo'
import { describeRemarks, groupKey, shortName } from './airspace'

export const NEARBY_KM = 50
const MAX_PLAN_ROWS = 6
const MAX_NEARBY = 6

// Rezerwacje stref, które złożyła ta baza (jednostka = jej kod ICAO), jeszcze
// nie zakończone. Sektory i sąsiednie strefy mają zwykle przesunięte o pół
// godziny okna (TS7A 10–11, TS7D 10–12, TS6 10:30–12:10) — wiersz na każde
// dawał sześć prawie identycznych linijek. Scalamy więc nakładające się
// rezerwacje z tym samym typem maszyn w jeden blok: „10:00–12:10 · F-35 ·
// TR11, TS6, TS7”.
export function basePlan(icao, zones, now) {
  const byWho = new Map()
  for (const z of zones || []) {
    for (const r of z.res) {
      if (r.unit !== icao || r.e <= now) continue
      const who = describeRemarks(r.rem)
      const key = who.join(',')
      if (!byWho.has(key)) byWho.set(key, { who, items: [] })
      byWho.get(key).items.push({ s: r.s, e: r.e, zone: shortName(groupKey(z.id)) })
    }
  }

  const rows = []
  for (const { who, items } of byWho.values()) {
    items.sort((a, b) => a.s - b.s)
    let cur = null
    for (const it of items) {
      if (cur && it.s <= cur.e) {
        cur.e = Math.max(cur.e, it.e)
        cur.zones.add(it.zone)
      } else {
        cur = { s: it.s, e: it.e, who, zones: new Set([it.zone]) }
        rows.push(cur)
      }
    }
  }

  return rows
    .sort((a, b) => a.s - b.s)
    .slice(0, MAX_PLAN_ROWS)
    .map(r => ({ ...r, active: r.s <= now, zones: [...r.zones].sort() }))
}

// Maszyny w powietrzu w promieniu NEARBY_KM, najbliższe pierwsze.
export function baseNearby(base, aircraft) {
  return (aircraft || [])
    .filter(a => a.lat != null && a.lon != null && !a.on_ground)
    .map(a => ({ ac: a, km: haversine(base.lat, base.lon, a.lat, a.lon) }))
    .filter(x => x.km <= NEARBY_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_NEARBY)
}
