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
import { POLITE_HEADERS, fetchAdsbfiGeo } from './lib/sources.js'
import { corsHeaders } from './lib/security.js'
import { BlobBook } from './lib/blobBook.js'
import {
  ARRIVAL_AIRPORTS, etaMinutes, distanceKm, isWatchedType, approachGuess,
  airportByIcao, verticalRate, leavingAirport, headingDiff, bearingTo,
} from '../../src/lib/inbound.js'

const UA = POLITE_HEADERS
const FRESH_MS = 3 * 60 * 1000
const STALE_MAX_MS = 60 * 60 * 1000
const ROUTE_TTL_MS = 24 * 60 * 60 * 1000
const DEST = new Set(ARRIVAL_AIRPORTS.map(a => a.icao))

let cache = null // { at, body }
// Trasy z adsbdb: znak wywoławczy → { at, route|null }. Jeden blob na całość
// (szczegóły w lib/blobBook.js), przeterminowane wypadają przy zapisie.
const routes = new BlobBook('book-routes', ROUTE_TTL_MS)

// Drugie źródło: ruch nad Polską z adsb.fi. Nie zabiera limitu adsb.lol
// (a ten potrafi odpowiedzieć 429 w środku przebiegu) i łapie maszynę, która
// jest już blisko — czyli dokładnie tę, o której powiadomienie ma sens.
// Antonow Airlines (ADB) bierzemy po znaku wywoławczym, bo pole typu bywa puste.
async function fetchNearPoland(records = null) {
  try {
    return (records ?? await fetchAdsbfiGeo()).filter(a =>
      typeof a.lat === 'number' && typeof a.lon === 'number' && (a.flight || '').trim() &&
      (isWatchedType(a.t) || /^ADB\d/.test((a.flight || '').trim().toUpperCase())))
  } catch {
    return []
  }
}

// Trasa bywa nieznana (loty bez planu w bazie) — zapamiętujemy też ten brak,
// żeby nie pytać o ten sam znak wywoławczy co trzy minuty.
// Wołający ładuje słownik (`routes.load`) przed i zapisuje (`routes.save`)
// po przebiegu — tu same odczyty z pamięci i zapytania do adsbdb.
async function fetchRoute(callsign) {
  const known = routes.get(callsign)
  if (known) return known.route

  let route = null
  try {
    const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
      signal: AbortSignal.timeout(5000), headers: UA,
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

  routes.set(callsign, { at: Date.now(), route })
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
// Tylko schodzący samolot. Wcześniej liczyło się też „na ziemi” — i pamięć
// zapisywała odloty (kołowanie, rozbieg, początek wznoszenia), więc znak
// wywoławczy lotu POWROTNEGO lądował w pamięci jako „ten siada w Rzeszowie”.
const LEARN_DESCENT_FPM = -200

// Wpisy sprzed poprawki z 02.11.2026 (przeniesione ze starych blobów
// `landed-…`) mają `unverified: true` — część z nich to odloty, a nie da się
// już stwierdzić które. Żyją krócej: prawdziwy rejs w tym czasie i tak
// znowu wyląduje i zapisze się jako pewny, a błędny wpis sam wygaśnie.
const UNVERIFIED_TTL_MS = 30 * 24 * 60 * 60 * 1000
const landings = new BlobBook('book-landings', rec => rec.unverified ? UNVERIFIED_TTL_MS : LEARNED_TTL_MS)
const RELEARN_MS = 24 * 60 * 60 * 1000

// Zapamiętuje lądowanie: maszyna obserwowanego typu tuż przy lotnisku, nisko
// i schodząca — to podejście końcowe, nie przelot ani start.
export async function learnLandings(records, store, now = Date.now()) {
  if (!store) return []
  await landings.load(store, now)
  const learned = []
  for (const a of records) {
    const callsign = (a.flight || '').trim()
    if (!callsign) continue
    if (a.alt_baro === 'ground' || a.on_ground === true) continue
    const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
    if (alt == null || alt > LEARN_MAX_FT) continue
    const vr = verticalRate(a)
    if (vr == null || vr > LEARN_DESCENT_FPM) continue
    const airport = ARRIVAL_AIRPORTS.find(ap => distanceKm(a, ap) <= LEARN_MAX_KM)
    if (!airport) continue
    learned.push(`${callsign}→${airport.icao}`)
    // Podejście trwa kilka przebiegów — ten sam wpis odnawiamy najwyżej raz
    // na dobę, chyba że zmienił się cel albo wpis był niepewny.
    const prev = landings.get(callsign, now)
    if (prev?.to === airport.icao && !prev.unverified && now - prev.at < RELEARN_MS) continue
    landings.set(callsign, { at: now, to: airport.icao })
  }
  await landings.save(store, now).catch(err => console.error('[inbound] zapis lądowań:', err.message))
  return learned
}

function learnedRoute(callsign, now = Date.now()) {
  const rec = landings.get(callsign, now)
  const airport = rec && airportByIcao(rec.to)
  if (!airport) return null
  return { from: null, fromCity: null, to: airport.icao, toCity: airport.name, learned: true }
}

// Migawka leży w Blobs, żeby czytał ją też cron powiadomień — inaczej każdy
// przebieg powiadomień musiałby sam pytać adsb.lol.
export const SNAPSHOT_STORE = 'inbound-snapshot'
export const SNAPSHOT_KEY = 'latest'
// Surowa lista obserwowanych typów z całego świata (zapytania do adsb.lol)
// — pisze ją cron na Cloudflare (cloudflare/types-collect.js), bo przerwy
// między zapytaniami kosztowały na Netlify jak praca funkcji. Trasy do niej
// rozwiązuje już `tick`: Worker na darmowym planie ma limit 50 zapytań
// wychodzących na uruchomienie, a każda maszyna to odczyt trasy z Blobs,
// często adsbdb i zapis — przy ~70 jumbo jetach limit pękał.
export const DEEP_RAW_KEY = 'deep-raw'
// Starsza lista znaczy, że cron na Cloudflare nie działa — lepiej pokazać
// same przyloty widziane nad Polską niż pozycje sprzed godziny.
const DEEP_MAX_AGE_MS = 30 * 60 * 1000

// Rekordy obserwowanych typów, z których da się ustalić przylot: z pozycją
// i ze znakiem wywoławczym (bez niego nie ma po czym szukać trasy).
export function watchedRecords(records) {
  return records.filter(a =>
    typeof a.lat === 'number' && typeof a.lon === 'number' && (a.flight || '').trim())
}

// Trasy rozwiązujemy po kilka naraz — przy nowych znakach wywoławczych to
// zapytania do adsbdb, a po kolei byłyby to sekundy czekania, za które
// Netlify liczy kredyty. Nie więcej, żeby nie zasypać serwisu.
const RESOLVE_CONCURRENCY = 8

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// Dwa tempa. Podejście do lądowania widać dopiero kilkadziesiąt kilometrów
// przed lotniskiem, czyli przez jakieś dziesięć minut lotu — przy zbieraniu
// co 10 minut maszyna potrafiłaby przemknąć między przebiegami. Dlatego lekki
// przebieg (ruch nad Polską z adsb.fi) chodzi co dwie minuty, a lista typów
// z całego świata (`typeRecords`, z Cloudflare) dochodzi tylko co dziesięć.
// `observed` (opcjonalny Set) dostaje hexy WSZYSTKICH maszyn widzianych
// w tym przebiegu, także odrzuconych — carryForward nie może wskrzesić
// maszyny, którą właśnie odsialiśmy jako startującą. `nearRecords` to ruch
// nad Polską już pobrany przez `tick` (bez nich pytamy adsb.fi sami).
export async function collect({
  store: injected = null, observed = null, nearRecords = null, typeRecords = [],
} = {}) {
  let store = injected
  if (!store) {
    try { store = getStore('flight-routes') } catch { /* bez cache też zadziała */ }
  }

  const seen = new Map()
  for (const a of typeRecords) {
    if (!seen.has(a.hex)) seen.set(a.hex, a)
  }

  await Promise.all([routes.load(store), landings.load(store)])
  const nearPoland = await fetchNearPoland(nearRecords)
  // Zanim cokolwiek policzymy: zapamiętaj, kto właśnie siada w Rzeszowie
  // albo Krakowie. To wiedza na następny raz.
  const learned = await learnLandings(nearPoland, store)
  if (learned.length) console.log(`[inbound] zapamiętane lądowania: ${learned.join(', ')}`)
  for (const a of nearPoland) {
    if (!seen.has(a.hex)) seen.set(a.hex, a)
  }
  if (observed) for (const hex of seen.keys()) observed.add(hex)

  const resolved = await mapLimit([...seen.values()], RESOLVE_CONCURRENCY, resolveArrival)
  await routes.save(store).catch(err => console.error('[inbound] zapis tras:', err.message))
  const out = resolved.filter(Boolean)
  // Najbliżej lądowania na górze.
  out.sort((x, y) => (x.etaMin ?? 1e9) - (y.etaMin ?? 1e9))
  return out
}

// Rekord z ADS-B → wpis przylotu albo null (nie leci do Rzeszowa/Krakowa).
async function resolveArrival(a) {
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
    vr: verticalRate(a) != null ? Math.round(verticalRate(a)) : null,
    on_ground: a.alt_baro === 'ground',
  }

  // Trasa z bazy ma pierwszeństwo: mówi wprost, dokąd lot jest zgłoszony,
  // i działa już nad Atlantykiem. Dopiero gdy jej nie ma, patrzymy, czy
  // maszyna nie podchodzi właśnie do lądowania.
  const known = await fetchRoute(callsign)
  let route = null
  let airport = null
  if (known) {
    if (!DEST.has(known.to)) return null
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
      const remembered = learnedRoute(callsign)
      if (!remembered) return null
      airport = airportByIcao(remembered.to)
      // Pamięć to tylko przesłanka (a przed poprawką z 02.11.2026 zapisywała
      // też odloty) — lot, który z daleka leci w przeciwną stronę, tam nie leci.
      if (ac.track != null && headingDiff(ac.track, bearingTo(ac, airport)) > 90) return null
      route = remembered
    }
  }

  // Cel znany, ale maszyna właśnie z niego startuje albo od niego odlatuje.
  if (leavingAirport(ac, airport)) return null

  return {
    ...ac,
    route,
    distKm: distanceKm(ac, airport),
    etaMin: etaMinutes(ac, airport),
  }
}

// Lekki przebieg nie pyta adsb.lol, więc nie widzi maszyn spoza okolic
// Polski — a to właśnie one są w migawce najdłużej (747 zza oceanu). Bez
// przeniesienia znikałyby z mapy na kilka minut i wracały przy każdym pełnym
// przebiegu. Pozycja bywa wtedy sprzed kilku minut; to ta sama umowa, na
// której migawka działała od początku.
export function carryForward(fresh, prev = [], observed = new Set()) {
  const have = new Set([...fresh.map(x => x.hex), ...observed])
  const carried = prev.filter(x => x && !have.has(x.hex) && x.route?.guess !== true)
  return [...fresh, ...carried].sort((x, y) => (x.etaMin ?? 1e9) - (y.etaMin ?? 1e9))
}

// Przyloty — część crona `tick` (co 2 min). `geoRecords` to ruch nad Polską
// pobrany raz dla wszystkich zadań ticka. Gdy z Cloudflare przyszła nowa
// lista typów (co 10 min), to jest przebieg pełny: rozwiązujemy jej trasy
// i wynik zapamiętujemy jako `deepInbound`. Między nimi tylko ruch nad
// Polską plus przeniesienie maszyn z ostatniego przebiegu pełnego.
export async function collectInbound(geoRecords) {
  const startedAt = Date.now()
  const store = getStore(SNAPSHOT_STORE)
  const [prev, raw] = await Promise.all([
    store.get(SNAPSHOT_KEY, { type: 'json' }).catch(() => null),
    store.get(DEEP_RAW_KEY, { type: 'json' }).catch(() => null),
  ])
  const rawFresh = !!raw && startedAt - raw.at < DEEP_MAX_AGE_MS
  const full = rawFresh && raw.at !== prev?.deepAt
  const observed = new Set()
  let inbound, deepInbound
  if (full) {
    inbound = deepInbound = await collect({ observed, nearRecords: geoRecords, typeRecords: raw.aircraft })
  } else {
    deepInbound = rawFresh ? prev?.deepInbound || [] : []
    const found = await collect({ observed, nearRecords: geoRecords })
    inbound = carryForward(found, deepInbound, observed)
  }
  await store.set(SNAPSHOT_KEY, JSON.stringify({
    at: Date.now(), deepAt: rawFresh ? raw.at : null, deepInbound, inbound,
  }))
  const note = full ? ' pełny' : rawFresh ? '' : ' (brak świeżej listy z Cloudflare)'
  return `inbound n=${inbound.length}${note} in ${Date.now() - startedAt}ms`
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
      // Najpierw migawka z crona (tick co 2 min) — wtedy otwarcie
      // aplikacji nie generuje ani jednego zapytania na zewnątrz.
      let inbound = null
      try {
        const snap = await getStore(SNAPSHOT_STORE).get(SNAPSHOT_KEY, { type: 'json' })
        if (snap && now - snap.at < 15 * 60 * 1000) inbound = snap.inbound
      } catch { /* brak migawki → pobierzemy sami */ }
      // Zapas, gdy tick nie działa: sam ruch nad Polską. Bez zapytań o typy —
      // z przerwami między nimi trwają kilka sekund, a tu czeka użytkownik.
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
