// „Plan dnia" — rezerwacje stref z planu PAŻP (AUP/UUP) złożone w listę lotów:
// kto (jednostka i maszyny), kiedy, na jakiej wysokości i gdzie. Czyste
// funkcje, bez sieci i Reacta.
//
// Jeden lot zajmuje zwykle kilka stref naraz: dywizjon z Łasku rezerwuje
// TR11A…E, TS7A…E i TS6A…C na te same godziny — w surowym planie to kilkanaście
// wierszy. Scalamy je po (jednostka, początek, koniec) w jeden blok.
import { altToMetres, describeRemarks, documentRef, groupKey, shortName, unitLabel } from './airspace.js'

const FIGHTERS = new Set(['F-35', 'F-16', 'F-15', 'F-18', 'MiG-29', 'Eurofighter', 'A-10', 'Rafale', 'Gripen'])
const HELIS = new Set(['Mi-2', 'Mi-8', 'Mi-17', 'Mi-24', 'W-3', 'SW-4', 'AW101', 'AW149', 'AH-64', 'UH-60', 'S-70'])
// Szkolenie: Dęblin (M-346, PZL-130) i Radom, Cessny i Diamondy Akademii
// Lotniczej. Użytkownik nie chce szkoleniowych na radarze, więc w planie są
// domyślnie ukryte.
const TRAINERS = new Set(['M-346', 'PZL-130', 'DA20', 'C150', 'TS-11', 'Z-242'])

// 'fighter' | 'heli' | 'training' | 'other'
export function blockCategory(types) {
  if (types.some(t => FIGHTERS.has(t))) return 'fighter'
  if (types.some(t => HELIS.has(t))) return 'heli'
  if (types.some(t => TRAINERS.has(t))) return 'training'
  return 'other'
}

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
})
// Doba po polskiemu czasu („2026-10-20"), nie UTC — plan PAŻP obowiązuje od
// 06:00 UTC, ale użytkownik myśli o „dziś" według zegarka.
export function warsawDay(ms) {
  return dayFmt.format(ms)
}

function minAlt(a, b) {
  if (a == null) return b
  if (b == null) return a
  return (altToMetres(b) ?? Infinity) < (altToMetres(a) ?? Infinity) ? b : a
}
function maxAlt(a, b) {
  if (a == null) return b
  if (b == null) return a
  return (altToMetres(b) ?? -Infinity) > (altToMetres(a) ?? -Infinity) ? b : a
}

// Sektory jednej strefy (EPTR11A…E) jako jedna krótka nazwa („TR11").
export function zoneNames(ids) {
  const out = []
  for (const id of ids) {
    const name = shortName(groupKey(id))
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/**
 * Strefy z /airspace → bloki planu, posortowane po początku.
 * Każdy blok: { key, unit, who, s, e, lo, hi, types, category, zones (id-y),
 * zoneNames, docs }.
 */
export function buildBlocks(zones, airfieldNames) {
  const byKey = new Map()
  for (const z of zones || []) {
    for (const r of z.res || []) {
      const key = `${r.unit || '?'}|${r.s}|${r.e}`
      let b = byKey.get(key)
      if (!b) {
        b = { key, unit: r.unit || null, s: r.s, e: r.e, lo: null, hi: null, types: [], zones: [], docs: [] }
        byKey.set(key, b)
      }
      b.lo = minAlt(b.lo, r.lo)
      b.hi = maxAlt(b.hi, r.hi)
      if (!b.zones.includes(z.id)) b.zones.push(z.id)
      for (const t of describeRemarks(r.rem)) if (!b.types.includes(t)) b.types.push(t)
      const doc = documentRef(r.rem)
      if (doc && !b.docs.some(d => d.id === doc.id)) b.docs.push(doc)
    }
  }
  return [...byKey.values()]
    .map(b => ({
      ...b,
      who: unitLabel(b.unit, airfieldNames),
      category: blockCategory(b.types),
      zoneNames: zoneNames(b.zones),
    }))
    .sort((a, b) => a.s - b.s || a.e - b.e)
}

export function blockStatus(b, now) {
  if (b.e <= now) return 'past'
  if (b.s <= now) return 'active'
  return 'upcoming'
}

/**
 * Bloki jednego dnia: 'today' — zaczynające się dziś oraz te sprzed północy,
 * które jeszcze trwają; 'tomorrow' — zaczynające się jutro (plan na kolejną
 * dobę PAŻP publikuje dzień wcześniej po południu).
 */
export function blocksForDay(blocks, day, now) {
  const today = warsawDay(now)
  const tomorrow = warsawDay(now + 24 * 3600_000)
  if (day === 'tomorrow') return blocks.filter(b => warsawDay(b.s) === tomorrow)
  return blocks.filter(b => warsawDay(b.s) === today || (b.s < now && b.e > now))
}

// Kolejność na liście: trwające (kończące się najwcześniej na górze),
// nadchodzące po godzinie startu, zakończone na końcu.
export function orderForList(blocks, now) {
  const rank = { active: 0, upcoming: 1, past: 2 }
  return [...blocks].sort((a, b) => {
    const sa = blockStatus(a, now), sb = blockStatus(b, now)
    if (sa !== sb) return rank[sa] - rank[sb]
    if (sa === 'active') return a.e - b.e
    return a.s - b.s
  })
}

// „za 2 h 15 min", „za 40 min".
export function startsIn(b, now) {
  const min = Math.max(0, Math.round((b.s - now) / 60000))
  if (min < 60) return `za ${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `za ${h} h ${m} min` : `za ${h} h`
}
