// Jumbo jety i An-124 nad całą Europą.
//
// Duże samoloty cywilne nie są w globalnym /mil, a zapytanie geograficzne
// adsb.fi sięga najwyżej 250 nm od środka Polski — dlatego pojawiały się na
// mapie dopiero przy granicy z Niemcami i Czechami. adsb.lol ma pytanie po
// typie, globalne. Pyta o nie wyłącznie cron `heavy-collect` (co minutę),
// a `aircraft` czyta gotową migawkę z Blobs — ruch na stronie nie trafia do
// adsb.lol z tego powodu.

export const HEAVY_STORE = 'heavy-europe'
export const HEAVY_KEY = 'snapshot'

// An-124, 747-8 i 747-400 — praktycznie cały ruch jumbo jetów nad Europą.
// adsb.lol przepuszcza ~3 zapytania pod rząd; czwarte (także po przerwie)
// dostaje 429, więc rzadkich odmian (747-200, 747SP) nie odpytujemy.
// An-124 pierwszy — to najrzadsza i najciekawsza maszyna. An-225 nie lata od 2022.
export const HEAVY_TYPES = ['A124', 'B748', 'B744']

// Gdy typ dostał 429, jego maszyny przenosimy z poprzedniej migawki, dopóki
// pozycja nie jest starsza niż to — inaczej ikony by migały.
const CARRY_MAX_AGE_MS = 3 * 60 * 1000

// Ten sam szeroki obszar co w `collect` (Europa, zachodnia Rosja, bliski wschód).
export const EUROPE_BOX = { lamin: 30, lomin: -15, lamax: 72, lomax: 50 }

// Starsza migawka (np. adsb.lol nie odpowiadał kilka minut) nie trafia na mapę.
export const HEAVY_MAX_AGE_MS = 5 * 60 * 1000
// Dalej niż tyle nie przesuwamy pozycji „w przód” — po tym czasie kurs mógł się zmienić.
const MAX_EXTRAPOLATE_S = 180

const UA = { 'User-Agent': 'MilitaryRadarPL/1.0 (+https://radar-wojskowy.netlify.app)', Accept: 'application/json' }
const sleep = ms => new Promise(r => setTimeout(r, ms))

export function inBox(a, box) {
  return typeof a.lat === 'number' && typeof a.lon === 'number' &&
    a.lat >= box.lamin && a.lat <= box.lamax && a.lon >= box.lomin && a.lon <= box.lomax
}

async function fetchType(type) {
  const url = `https://api.adsb.lol/v2/type/${type}`
  let res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: UA })
  // adsb.lol odpowiada 429 na serię zapytań pod rząd — jedno ponowienie po przerwie.
  if (res.status === 429) {
    await sleep(3000)
    res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: UA })
  }
  if (!res.ok) throw new Error(`adsb.lol ${type}: ${res.status}`)
  const data = await res.json()
  return data.ac || []
}

/**
 * Pobiera typy tego przebiegu (po kolei, z odstępem) i zostawia maszyny nad Europą.
 * Każdy rekord dostaje `_at` — chwilę pobrania, od której liczymy wiek pozycji.
 */
export async function fetchHeavyEurope(now = Date.now()) {
  const byHex = new Map()
  const failed = []
  const fetched = []
  for (const [i, type] of HEAVY_TYPES.entries()) {
    if (i) await sleep(1500)
    try {
      for (const a of await fetchType(type)) {
        if (a?.hex && inBox(a, EUROPE_BOX) && !byHex.has(a.hex)) byHex.set(a.hex, { ...a, _at: now })
      }
      fetched.push(type)
    } catch (err) {
      failed.push(err.message)
    }
  }
  return { aircraft: [...byHex.values()], fetched, failed }
}

/** Dokłada z poprzedniej migawki maszyny typów, których teraz nie udało się pobrać (429). */
export function carryForward(current, fetchedTypes, previous, now = Date.now()) {
  const have = new Set(current.map(a => a.hex))
  const fetched = new Set(fetchedTypes)
  const kept = (previous?.aircraft || []).filter(a =>
    !have.has(a.hex) && !fetched.has(String(a.t || '').toUpperCase()) &&
    now - (a._at ?? previous.at) <= CARRY_MAX_AGE_MS)
  return [...current, ...kept]
}

/**
 * Przesuwa pozycję do „teraz” wg prędkości i kursu — rekord z adsb.lol bywa
 * sprzed minuty, a klient rysuje ikonę tam, gdzie dostał pozycję.
 */
export function extrapolate(a, ageS) {
  if (!(ageS > 0) || typeof a.gs !== 'number' || typeof a.track !== 'number' || a.alt_baro === 'ground') return a
  const s = Math.min(ageS, MAX_EXTRAPOLATE_S)
  const distNm = (a.gs * s) / 3600
  const rad = (a.track * Math.PI) / 180
  const dLat = (distNm * Math.cos(rad)) / 60
  const dLon = (distNm * Math.sin(rad)) / (60 * Math.cos((a.lat * Math.PI) / 180))
  return { ...a, lat: a.lat + dLat, lon: a.lon + dLon }
}

/**
 * Dokleja jumbo jety z migawki do listy na żywo: tylko te, których tam jeszcze
 * nie ma (nad Polską są świeższe dane z adsb.fi), tylko w obszarze zapytania.
 * `map` to ten sam mapper rekordów co dla adsb.fi.
 */
export function mergeHeavies(live, snapshot, box, map, now = Date.now()) {
  if (!snapshot?.aircraft?.length || !(now - snapshot.at <= HEAVY_MAX_AGE_MS)) return live
  const have = new Set(live.map(a => a.hex))
  const extra = []
  for (const raw of snapshot.aircraft) {
    const hex = String(raw.hex || '').toLowerCase()
    if (!hex || have.has(hex)) continue
    const fetchedAt = raw._at ?? snapshot.at
    if (now - fetchedAt > HEAVY_MAX_AGE_MS) continue
    const posAgeS = (now - fetchedAt) / 1000 + (typeof raw.seen_pos === 'number' ? raw.seen_pos : 0)
    const moved = extrapolate(raw, posAgeS)
    if (!inBox(moved, box)) continue
    const { _at, ...rec } = moved
    extra.push(map({ ...rec, _kind: 'heavy' }))
    have.add(hex)
  }
  return extra.length ? [...live, ...extra] : live
}
