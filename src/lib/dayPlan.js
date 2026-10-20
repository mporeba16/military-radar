// „Plan dnia" — rezerwacje stref z planu PAŻP (AUP/UUP) złożone w listę lotów:
// kto (jednostka i maszyny), kiedy, na jakiej wysokości i gdzie. Czyste
// funkcje, bez sieci i Reacta.
//
// Jeden lot zajmuje zwykle kilka stref naraz, a jednostka rezerwuje na jeden
// dzień kilka nakładających się okien: Krzesiny potrafią mieć sześć wierszy
// F-16 na wieczór. Dla użytkownika to jeden dzień lotów, więc blok to
// (jednostka, dzień) z listą przedziałów godzin.
import { KNOWN_AIRCRAFT_NAMES, altToMetres, describeRemarks, documentRef, groupKey, shortName, unitLabel } from './airspace.js'

const FIGHTERS = new Set(['F-35', 'F-16', 'F-15', 'F-18', 'MiG-29', 'Eurofighter', 'A-10', 'Rafale', 'Gripen'])
const HELIS = new Set(['Mi-2', 'Mi-8', 'Mi-17', 'Mi-24', 'W-3', 'SW-4', 'AW101', 'AW149', 'AH-64', 'UH-60', 'S-70'])
// Szkolenie: Dęblin (M-346, PZL-130) i Radom, Cessny i Diamondy Akademii
// Lotniczej. Użytkownik nie chce szkoleniowych na radarze, więc w planie też
// ich nie ma.
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

const plural = (n, one, few, many) => {
  if (n === 1) return one
  const d = n % 10, dd = n % 100
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many
}

// Zamiast kodów (TR11, MRT17…), które nic nie mówią: ile stref i ile odcinków
// tras (MRT — wojskowe trasy przelotowe między lotniskiem a strefami).
// Gdzie dokładnie — pokazuje kliknięcie na mapie.
export function zoneSummary(ids) {
  const names = zoneNames(ids)
  const routes = names.filter(n => /^MRT/.test(n)).length
  const areas = names.length - routes
  const parts = []
  if (areas) parts.push(`${areas} ${plural(areas, 'strefa', 'strefy', 'stref')}`)
  if (routes) parts.push(`${routes} ${plural(routes, 'odcinek trasy', 'odcinki tras', 'odcinków tras')}`)
  return parts.join(' + ')
}

// Nakładające się i stykające przedziały → rozłączne, po kolei.
export function mergeWindows(windows) {
  const out = []
  for (const w of [...windows].sort((x, y) => x.s - y.s)) {
    const last = out[out.length - 1]
    if (last && w.s <= last.e) last.e = Math.max(last.e, w.e)
    else out.push({ s: w.s, e: w.e })
  }
  return out
}

/**
 * Strefy z /airspace → bloki planu, jeden na jednostkę i dzień. Rezerwacje
 * bez rozpoznanej maszyny („wojsko", poligony, kryptonimy) i same szkolne
 * odpadają.
 * Blok: { key, unit, who, day, s, e, windows, lo, hi, types, category,
 * zones (id-y), zonesText, docs }.
 */
export function buildBlocks(zones, airfieldNames) {
  // 1) Pojedyncze rezerwacje → sloty (jednostka, początek, koniec).
  const slots = new Map()
  for (const z of zones || []) {
    for (const r of z.res || []) {
      const key = `${r.unit || '?'}|${r.s}|${r.e}`
      let sl = slots.get(key)
      if (!sl) {
        sl = { unit: r.unit || null, s: r.s, e: r.e, lo: null, hi: null, types: [], zones: [], docs: [] }
        slots.set(key, sl)
      }
      sl.lo = minAlt(sl.lo, r.lo)
      sl.hi = maxAlt(sl.hi, r.hi)
      if (!sl.zones.includes(z.id)) sl.zones.push(z.id)
      // Tylko rozpoznane maszyny — kryptonimy i skróty jednostek („PJE")
      // nie mówią, co poleci.
      for (const t of describeRemarks(r.rem)) {
        if (KNOWN_AIRCRAFT_NAMES.has(t) && !sl.types.includes(t)) sl.types.push(t)
      }
      const doc = documentRef(r.rem)
      if (doc && !sl.docs.some(d => d.id === doc.id)) sl.docs.push(doc)
    }
  }

  // 2) Sloty jednej jednostki z jednego dnia → blok.
  const blocks = new Map()
  for (const sl of slots.values()) {
    if (!sl.types.length || blockCategory(sl.types) === 'training') continue
    const day = warsawDay(sl.s)
    const key = `${sl.unit || '?'}|${day}`
    let b = blocks.get(key)
    if (!b) {
      b = { key, unit: sl.unit, day, windows: [], lo: null, hi: null, types: [], zones: [], docs: [] }
      blocks.set(key, b)
    }
    b.windows.push({ s: sl.s, e: sl.e })
    b.lo = minAlt(b.lo, sl.lo)
    b.hi = maxAlt(b.hi, sl.hi)
    for (const t of sl.types) if (!b.types.includes(t)) b.types.push(t)
    for (const id of sl.zones) if (!b.zones.includes(id)) b.zones.push(id)
    for (const d of sl.docs) if (!b.docs.some(x => x.id === d.id)) b.docs.push(d)
  }

  return [...blocks.values()]
    .map(b => {
      const windows = mergeWindows(b.windows)
      // Szkolne obok śmigłowców Dęblina (M-346, DA20, C150) tylko zaśmiecają
      // opis — blok jest na liście dzięki pozostałym maszynom.
      const types = b.types.filter(t => !TRAINERS.has(t))
      return {
        ...b,
        types,
        windows,
        s: windows[0].s,
        e: windows[windows.length - 1].e,
        who: unitLabel(b.unit, airfieldNames),
        category: blockCategory(b.types),
        zonesText: zoneSummary(b.zones),
      }
    })
    .sort((a, b) => a.s - b.s || a.e - b.e)
}

const windowsOf = b => b.windows || [{ s: b.s, e: b.e }]

export function blockStatus(b, now) {
  const ws = windowsOf(b)
  if (ws.some(w => w.s <= now && now < w.e)) return 'active'
  if (ws.every(w => w.e <= now)) return 'past'
  return 'upcoming'
}

// Początek najbliższego okna, które jeszcze się nie zaczęło.
export function nextStart(b, now) {
  return windowsOf(b).find(w => w.s > now)?.s ?? null
}

/**
 * Bloki jednego dnia: 'today' — dzisiejsze oraz wczorajsze, które jeszcze
 * trwają; 'tomorrow' — jutrzejsze (plan na kolejną dobę PAŻP publikuje dzień
 * wcześniej po południu).
 */
export function blocksForDay(blocks, day, now) {
  const today = warsawDay(now)
  const tomorrow = warsawDay(now + 24 * 3600_000)
  if (day === 'tomorrow') return blocks.filter(b => b.day === tomorrow)
  return blocks.filter(b => b.day === today || (b.s < now && b.e > now))
}

// Kolejność na liście: trwające, nadchodzące wg najbliższego startu,
// zakończone na końcu.
export function orderForList(blocks, now) {
  const rank = { active: 0, upcoming: 1, past: 2 }
  return [...blocks].sort((a, b) => {
    const sa = blockStatus(a, now), sb = blockStatus(b, now)
    if (sa !== sb) return rank[sa] - rank[sb]
    if (sa === 'upcoming') return nextStart(a, now) - nextStart(b, now)
    return a.s - b.s
  })
}

// „za 2 h 15 min", „za 40 min" — do najbliższego okna.
export function startsIn(b, now) {
  const at = nextStart(b, now) ?? b.s
  const min = Math.max(0, Math.round((at - now) / 60000))
  if (min < 60) return `za ${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `za ${h} h ${m} min` : `za ${h} h`
}
