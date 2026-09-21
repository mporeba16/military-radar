// Jumbo jety i An-124 lecące do Rzeszowa albo Krakowa.
//
// Trzy zewnętrzne źródła, wszystkie darmowe i społecznościowe:
//   - adsb.lol  /v2/type/{typ} — globalnie wszystkie maszyny danego typu;
//     łapie 747 jeszcze nad Atlantykiem (adsb.fi nie ma pytania po typie),
//   - adsb.fi   /v2/lat/lon/dist — ruch nad Polską; łapie maszynę, która jest
//     już blisko, także wtedy, gdy adsb.lol akurat odmówił,
//   - adsbdb.com /v0/callsign/{znak} — trasa lotu; ADS-B nie niesie celu.
//
// Cel ustalamy dwiema drogami: z trasy w bazie, a gdy jej nie ma (czartery
// towarowe rzadko tam są) — z geometrii podejścia do lądowania. Zapytania
// idą wyłącznie stąd i mają pamięć podręczną, więc ruch na stronie nie
// przekłada się na obciążenie tych serwisów.

import { getStore, connectLambda } from '@netlify/blobs'
import { corsHeaders } from './lib/security.js'
import {
  WATCHED_TYPES, ARRIVAL_AIRPORTS, etaMinutes, distanceKm, isWatchedType, approachGuess,
  airportByIcao,
} from '../../src/lib/inbound.js'

const UA = { 'User-Agent': 'MilitaryRadarPL/1.0 (+https://radar-wojskowy.netlify.app)', Accept: 'application/json' }
const FRESH_MS = 3 * 60 * 1000
const STALE_MAX_MS = 60 * 60 * 1000
const ROUTE_TTL_MS = 24 * 60 * 60 * 1000
const DEST = new Set(ARRIVAL_AIRPORTS.map(a => a.icao))

let cache = null // { at, body }
const routeMem = new Map() // callsign → { at, route|null }

const sleep = ms => new Promise(r => setTimeout(r, ms))

// adsb.lol odpowiada 429 na serię zapytań pod rząd — stąd odstęp między
// typami i jedno ponowienie po dłuższej przerwie.
async function fetchType(type) {
  let res = await fetch(`https://api.adsb.lol/v2/type/${type}`, {
    signal: AbortSignal.timeout(8000), headers: UA,
  })
  if (res.status === 429) {
    await sleep(2500)
    res = await fetch(`https://api.adsb.lol/v2/type/${type}`, {
      signal: AbortSignal.timeout(8000), headers: UA,
    })
  }
  if (!res.ok) return []
  const data = await res.json()
  return (data.ac || []).filter(a =>
    typeof a.lat === 'number' && typeof a.lon === 'number' && (a.flight || '').trim())
}

// Drugie źródło: ruch nad Polską z adsb.fi. Nie zabiera limitu adsb.lol
// (a ten potrafi odpowiedzieć 429 w środku przebiegu) i łapie maszynę, która
// jest już blisko — czyli dokładnie tę, o której powiadomienie ma sens.
// Antonow Airlines (ADB) bierzemy po znaku wywoławczym, bo pole typu bywa puste.
const POLAND = { lat: '52.0', lon: '19.4', nm: 250 }

async function fetchNearPoland() {
  try {
    const res = await fetch(
      `https://opendata.adsb.fi/api/v2/lat/${POLAND.lat}/lon/${POLAND.lon}/dist/${POLAND.nm}`,
      { signal: AbortSignal.timeout(8000), headers: UA },
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.ac || data.aircraft || []).filter(a =>
      typeof a.lat === 'number' && typeof a.lon === 'number' && (a.flight || '').trim() &&
      (isWatchedType(a.t) || /^ADB\d/.test((a.flight || '').trim().toUpperCase())))
  } catch {
    return []
  }
}

// Trasa bywa nieznana (loty bez planu w bazie) — zapamiętujemy też ten brak,
// żeby nie pytać o ten sam znak wywoławczy co trzy minuty.
async function fetchRoute(callsign, store) {
  const mem = routeMem.get(callsign)
  if (mem && Date.now() - mem.at < ROUTE_TTL_MS) return mem.route

  const key = `route-${callsign}`
  try {
    const saved = await store?.get(key, { type: 'json' })
    if (saved && Date.now() - saved.at < ROUTE_TTL_MS) {
      routeMem.set(callsign, saved)
      return saved.route
    }
  } catch { /* brak cache → pytamy */ }

  let route = null
  try {
    const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
      signal: AbortSignal.timeout(8000), headers: UA,
    })
    if (res.ok) {
      const fr = (await res.json())?.response?.flightroute
      if (fr?.destination?.icao_code) {
        route = {
          from: fr.origin?.icao_code || null,
          fromCity: fr.origin?.municipality || null,
          to: fr.destination.icao_code,
          toCity: fr.destination.municipality || null,
        }
      }
    }
  } catch { /* brak trasy traktujemy jak nieznaną */ }

  const rec = { at: Date.now(), route }
  routeMem.set(callsign, rec)
  await store?.set(key, JSON.stringify(rec)).catch(() => {})
  return route
}

// ── Pamięć lądowań ───────────────────────────────────────────────────────
// Czartery towarowe do Rzeszowa nie mają trasy w ŻADNEJ darmowej bazie:
// adsbdb nie zna ani CMB336 (Kalitta, Dover → Rzeszów), ani NCR844, ani
// K4336; baza tras adsb.lol nie odpowiada. Bez trasy jedyne, co zostaje, to
// geometria podejścia — a ta działa dopiero kilkadziesiąt kilometrów przed
// lotniskiem, czyli kwadrans przed lądowaniem.
//
// Ale te rejsy się powtarzają pod tym samym znakiem wywoławczym. Skoro raz
// widzieliśmy, jak CMB336 siada w Rzeszowie, to następnym razem wiemy o tym
// już przy starcie z Dover — a startujący samolot widać: zasięg ADS-B nad
// Ameryką jest gęsty (nie ma go dopiero nad środkiem Atlantyku).
//
// To przesłanka, nie plan lotu: ten sam znak może kiedyś polecieć gdzie
// indziej. Dlatego powiadomienie mówi wprost, skąd wiemy.
const LEARNED_TTL_MS = 90 * 24 * 60 * 60 * 1000
const LEARN_MAX_KM = 12
const LEARN_MAX_FT = 2500

const learnedMem = new Map() // callsign → { at, to } | null

const learnedKey = callsign => `landed-${callsign}`

// Zapamiętuje lądowanie: maszyna obserwowanego typu tuż przy lotnisku i nisko
// (albo już na ziemi) — to podejście końcowe, nie przelot.
export async function learnLandings(records, store, now = Date.now()) {
  if (!store) return []
  const learned = []
  for (const a of records) {
    const callsign = (a.flight || '').trim()
    if (!callsign) continue
    const onGround = a.alt_baro === 'ground' || a.on_ground === true
    const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
    if (!onGround && (alt == null || alt > LEARN_MAX_FT)) continue
    const airport = ARRIVAL_AIRPORTS.find(ap => distanceKm(a, ap) <= LEARN_MAX_KM)
    if (!airport) continue
    const rec = { at: now, to: airport.icao }
    const prev = learnedMem.get(callsign)
    learnedMem.set(callsign, rec)
    learned.push(`${callsign}→${airport.icao}`)
    // Zapis tylko przy zmianie albo raz na dobę — inaczej co dwie minuty
    // pisalibyśmy to samo przez cały postój maszyny na płycie.
    if (prev?.to === airport.icao && now - prev.at < 24 * 60 * 60 * 1000) continue
    await store.set(learnedKey(callsign), JSON.stringify(rec)).catch(() => {})
  }
  return learned
}

async function learnedRoute(callsign, store, now = Date.now()) {
  let rec = learnedMem.get(callsign)
  if (rec === undefined) {
    rec = (await store?.get(learnedKey(callsign), { type: 'json' }).catch(() => null)) || null
    learnedMem.set(callsign, rec)
  }
  if (!rec || now - rec.at > LEARNED_TTL_MS) return null
  const airport = airportByIcao(rec.to)
  if (!airport) return null
  return { from: null, fromCity: null, to: airport.icao, toCity: airport.name, learned: true }
}

// Migawka leży w Blobs, żeby czytał ją też cron powiadomień — inaczej każdy
// przebieg notify (co minutę) musiałby sam pytać adsb.lol.
export const SNAPSHOT_STORE = 'inbound-snapshot'
export const SNAPSHOT_KEY = 'latest'

// Dwa tempa. Podejście do lądowania widać dopiero kilkadziesiąt kilometrów
// przed lotniskiem, czyli przez jakieś dziesięć minut lotu — przy zbieraniu
// co 10 minut maszyna potrafiłaby przemknąć między przebiegami. Dlatego lekki
// przebieg (jedno zapytanie do adsb.fi o ruch nad Polską) chodzi co dwie
// minuty, a ciężki (zapytania o typy do adsb.lol, które limituje ruch)
// dokłada się do niego tylko co dziesięć.
export async function collect({ deep = true, store: injected = null } = {}) {
  let store = injected
  if (!store) {
    try { store = getStore('flight-routes') } catch { /* bez cache też zadziała */ }
  }

  const seen = new Map()
  if (deep) {
    // Typy pobieramy po kolei, z odstępem — adsb.lol to serwis społecznościowy
    // i po kilku zapytaniach pod rząd zaczyna odpowiadać 429.
    for (const type of WATCHED_TYPES) {
      for (const a of await fetchType(type)) {
        if (!seen.has(a.hex)) seen.set(a.hex, a)
      }
      await sleep(1200)
    }
  }

  const nearPoland = await fetchNearPoland()
  // Zanim cokolwiek policzymy: zapamiętaj, kto właśnie siada w Rzeszowie
  // albo Krakowie. To wiedza na następny raz.
  const learned = await learnLandings(nearPoland, store)
  if (learned.length) console.log(`[inbound] zapamiętane lądowania: ${learned.join(', ')}`)
  for (const a of nearPoland) {
    if (!seen.has(a.hex)) seen.set(a.hex, a)
  }

  const out = []
  for (const a of seen.values()) {
    const callsign = (a.flight || '').trim()
    const ac = {
      hex: a.hex,
      flight: callsign,
      t: a.t || '',
      reg: a.r || null,
      lat: a.lat,
      lon: a.lon,
      alt_baro: typeof a.alt_baro === 'number' ? a.alt_baro : null,
      gs: a.gs != null ? Math.round(a.gs) : null,
      track: a.track != null ? Math.round(a.track) : null,
      on_ground: a.alt_baro === 'ground',
    }

    // Trasa z bazy ma pierwszeństwo: mówi wprost, dokąd lot jest zgłoszony,
    // i działa już nad Atlantykiem. Dopiero gdy jej nie ma, patrzymy, czy
    // maszyna nie podchodzi właśnie do lądowania.
    const known = await fetchRoute(callsign, store)
    let route = null
    let airport = null
    if (known) {
      if (!DEST.has(known.to)) continue
      route = known
      airport = ARRIVAL_AIRPORTS.find(x => x.icao === known.to)
    } else {
      // Bez trasy z bazy: najpierw geometria (pewna, ale tylko z bliska),
      // potem pamięć wcześniejszych lądowań (niepewna, za to działa już
      // po starcie po drugiej stronie oceanu).
      const guess = approachGuess(ac)
      if (guess) {
        airport = guess.airport
        route = { from: null, fromCity: null, to: airport.icao, toCity: airport.name, guess: true }
      } else {
        const remembered = await learnedRoute(callsign, store)
        if (!remembered) continue
        airport = airportByIcao(remembered.to)
        route = remembered
      }
    }

    out.push({
      ...ac,
      route,
      distKm: distanceKm(ac, airport),
      etaMin: etaMinutes(ac, airport),
    })
  }
  // Najbliżej lądowania na górze.
  out.sort((x, y) => (x.etaMin ?? 1e9) - (y.etaMin ?? 1e9))
  return out
}

// Lekki przebieg nie pyta adsb.lol, więc nie widzi maszyn spoza okolic
// Polski — a to właśnie one są w migawce najdłużej (747 zza oceanu). Bez
// przeniesienia znikałyby z mapy na kilka minut i wracały przy każdym pełnym
// przebiegu. Pozycja bywa wtedy sprzed kilku minut; to ta sama umowa, na
// której migawka działała od początku.
export function carryForward(fresh, prev = []) {
  const have = new Set(fresh.map(x => x.hex))
  const carried = prev.filter(x => x && !have.has(x.hex) && x.route?.guess !== true)
  return [...fresh, ...carried].sort((x, y) => (x.etaMin ?? 1e9) - (y.etaMin ?? 1e9))
}

export const handler = async (event) => {
  try { if (event?.blobs) connectLambda(event) } catch { /* poza Netlify */ }
  const headers = corsHeaders(event)
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const now = Date.now()
  if (!cache || now - cache.at > FRESH_MS) {
    try {
      // Najpierw migawka z crona (inbound-collect co 2 min) — wtedy otwarcie
      // aplikacji nie generuje ani jednego zapytania na zewnątrz.
      let inbound = null
      try {
        const snap = await getStore(SNAPSHOT_STORE).get(SNAPSHOT_KEY, { type: 'json' })
        if (snap && now - snap.at < 15 * 60 * 1000) inbound = snap.inbound
      } catch { /* brak migawki → pobierzemy sami */ }
      if (!inbound) inbound = await collect()
      cache = { at: now, body: JSON.stringify({ updated: new Date(now).toISOString(), inbound }) }
    } catch (err) {
      if (!cache || now - cache.at > STALE_MAX_MS) {
        console.error('[inbound]', err.message)
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'upstream' }) }
      }
    }
  }

  return {
    statusCode: 200,
    headers: { ...headers, 'Cache-Control': 'public, max-age=60, s-maxage=180' },
    body: cache.body,
  }
}
