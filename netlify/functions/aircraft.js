// OpenSky Network API — darmowe, bez klucza (limit: ~100 req/10min dla anonimowych)
// Docs: https://openskynetwork.github.io/opensky-api/rest.html
//
// OpenSky nie ma flagi "military", więc filtrujemy po:
// 1. Znanych blokach ICAO przydzielonych wojsku (hex prefix)
// 2. Callsignach wojskowych (RCF, PLF, DUKE, JAKE, itp.)
// 3. Squawk kodach wojskowych (7777, 7400 itp.)

import { getStore, connectLambda } from '@netlify/blobs'
import { corsHeaders } from './lib/security.js'
import { snapshotKey } from './lib/snapshot.js'
import { isInPoland } from './lib/poland.js'
import { HEAVY_KEY, HEAVY_STORE, mergeHeavies } from './lib/heavyEurope.js'
import { filterMlatSpikes, MLAT_MIN_INTERVAL_MS } from '../../src/lib/trailFilter.js'
import {
  isTrainingAircraft,
  classifyExtra,
  isMilitaryADSBfiRecord,
  isPlausibleRecord,
} from './lib/military.js'
import { fetchMilMerged, fetchAdsbfiGeo, fetchOpenSkyMilitary } from './lib/sources.js'

// Redukcja szumu: poza Polską pokazujemy tylko maszyny ze znanym kodem typu.
// Rekordy bez `t` to zwykle Mode-S / MLAT bez danych — masa kropek bez wartości.
// W Polsce pokazujemy wszystko (także bez typu), żeby nic lokalnie nie umknęło.
function passesTypeNoise(a) {
  if ((a.t || '').trim()) return true
  return isInPoland(a.lat, a.lon)
}

// Wspólny cache live-snapshotu (redukuje zapytania do adsb.fi → mniej 429)
const SNAPSHOT_TTL_MS = 9000
// Jak stara może być migawka oddana, gdy źródła nie odpowiadają. Dziesięć
// minut to granica, po której pozycje przestają mieć sens (maszyna zdąży
// przelecieć ~130 km).
const STALE_FALLBACK_MS = 10 * 60 * 1000

// Co oddać, gdy oba źródła padły. Migawka młodsza niż STALE_FALLBACK_MS wraca
// z oznaczeniem wieku; starsza jest bezużyteczna, więc wtedy pusta lista.
export function staleFallback(snapshot, now) {
  const age = snapshot?.ts ? now - snapshot.ts : Infinity
  if (!snapshot?.aircraft?.length || age >= STALE_FALLBACK_MS) {
    return { aircraft: [], _source: 'unavailable' }
  }
  return { aircraft: snapshot.aircraft, _source: snapshot.source, _stale: true, _ageMs: age }
}


const TRAIL_MAX_AGE_MS = 4 * 60 * 60 * 1000  // 4 godziny historii
const TRAIL_MIN_INTERVAL_MS = 15_000           // min. 15s między punktami
// Gdy w trasie pojawia się przerwa dłuższa niż FLIGHT_SPLIT_GAP_MS, traktujemy
// to jako granicę między lotami (samolot wylądował i wystartował ponownie).
const FLIGHT_SPLIT_GAP_MS = 10 * 60 * 1000

// Returns only the points after the most recent gap >= FLIGHT_SPLIT_GAP_MS.
// Assumes input is sorted ascending by ts.
//
// With `now`, the gap between the last point and now counts too. Blobs are
// pruned only when the aircraft is written again, so a hex that stopped being
// saved (left the area, MLAT only) keeps an old trail for months. Without this
// check that trail came back as the "current flight" and the card showed
// a flight time of 2927 hours.
export function currentFlightOnly(sortedPoints, now) {
  if (now != null) {
    const last = sortedPoints[sortedPoints.length - 1]
    if (!last || now - last.ts > FLIGHT_SPLIT_GAP_MS) return []
  }
  if (sortedPoints.length < 2) return sortedPoints
  let cutIndex = 0
  for (let i = 1; i < sortedPoints.length; i++) {
    if (sortedPoints[i].ts - sortedPoints[i - 1].ts > FLIGHT_SPLIT_GAP_MS) {
      cutIndex = i
    }
  }
  return sortedPoints.slice(cutIndex)
}

// Filters out points that would require an implausible ground speed to reach
// from the previous point — these are MLAT/coverage-gap glitches that show
// up as zigzags over open water. 2000 km/h is faster than any operational
// military aircraft, so legitimate fast turns / supersonic passes survive.
const TRAIL_MAX_PLAUSIBLE_KMH = 2000

export function filterImplausibleJumps(sortedPoints) {
  if (sortedPoints.length < 2) return sortedPoints
  const result = [sortedPoints[0]]
  for (let i = 1; i < sortedPoints.length; i++) {
    const last = result[result.length - 1]
    const curr = sortedPoints[i]
    const dtHours = (curr.ts - last.ts) / 3600000
    // Only check when points are within a 30-min window — across larger
    // gaps the average implied speed is meaningless because the aircraft
    // may have been outside our sampling.
    if (dtHours > 0 && dtHours < 0.5) {
      const dx = (curr.lon - last.lon) * 111 * Math.cos(last.lat * Math.PI / 180)
      const dy = (curr.lat - last.lat) * 111
      const distKm = Math.sqrt(dx * dx + dy * dy)
      if (distKm / dtHours > TRAIL_MAX_PLAUSIBLE_KMH) continue
    }
    result.push(curr)
  }
  return result
}

// In-memory cache — survives across warm function invocations (eliminates per-aircraft blob reads)
const trailCache = new Map() // hex → { points, flight, t }

// OpenSky — zapas, gdy adsb.fi i adsb.lol zawiodą (szczegóły w sources.js).
async function tryOpenSky(lamin, lomin, lamax, lomax) {
  const aircraft = await fetchOpenSkyMilitary({ lamin, lomin, lamax, lomax })
  return aircraft ? { aircraft, _source: 'opensky' } : null
}

function mapADSBfiRecord(a) {
  // Używamy WYŁĄCZNIE realnej pozycji (a.lat/a.lon) — pokrywa to ADS-B oraz
  // wyliczony MLAT. NIE schodzimy do rr_lat/rr_lon (rough receiver) — to tylko
  // lokalizacja odbiornika, potrafiąca być oddalona o dziesiątki km od maszyny
  // (powodowała „odskok" ikony od trasy). Rekordy bez realnej pozycji są
  // odsiewane już w isADSBfiRecordInBox — maszyna znika z radaru, dopóki nie
  // odzyska własnego fixa (zamiast pokazywać ją w przybliżonym miejscu).
  return {
    hex: (a.hex || '').toLowerCase(),
    flight: (a.flight || a.hex || '').trim(),
    t: a.t || '',
    lat: a.lat,
    lon: a.lon,
    alt_baro: (a.alt_baro != null && a.alt_baro !== 'ground') ? a.alt_baro : null,
    gs: a.gs != null ? Math.round(a.gs) : null,
    track: a.track != null ? Math.round(a.track) : null,
    baro_rate: a.baro_rate != null ? Math.round(a.baro_rate) : null,
    squawk: a.squawk || null,
    reg: a.r || null,
    // Kategoria emitera ADS-B (A7 = wiropłat). Nadaje ją sama maszyna, więc
    // przy pustym kodzie typu jest jedynym pewnym sygnałem, że to śmigłowiec —
    // bez niej mapa rysowała Mi-8 jako odrzutowiec.
    category: a.category || null,
    country: '',
    on_ground: a.alt_baro === 'ground' || !!a.on_ground,
    // MLAT-derived position (adsb.fi oznacza pola wyliczone w tablicy `mlat`) —
    // bywa skokowy: w trasie zapisywany rzadziej i z flagą, odskoki odsiewa filterMlatSpikes.
    mlat: Array.isArray(a.mlat) && a.mlat.length > 0,
    kind: a._kind || 'mil',
  }
}

function isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax) {
  return isPlausibleRecord(a) &&
    a.lat >= lamin && a.lat <= lamax && a.lon >= lomin && a.lon <= lomax
}

// adsb.fi — publiczne API, działa z serverless, pokrywa Europę.
// Oprócz globalnego /mil robimy zapytanie geograficzne wycentrowane na Polsce,
// żeby złapać maszyny nieoznaczone w bazie /mil (wojsko po callsignie/hex,
// służbowe śmigłowce, duże samoloty).
async function tryADSBfi(lamin, lomin, lamax, lomax) {
  // Zapytanie 1: globalne listy wojskowe z adsb.fi i adsb.lol (sources.js).
  // Padły obie — dopiero to jest awaria źródła (wyżej zadziała wtedy
  // ostatnia migawka zamiast pustej mapy).
  let records
  try { ({ records } = await fetchMilMerged()) } catch { return null }
  if (!records.length) return null
  const milAircraft = records
    .filter(a => isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax) && passesTypeNoise(a) &&
      !isTrainingAircraft(a.t))
    .map(a => ({ ...a, _kind: 'mil' }))
  const milHexes = new Set(milAircraft.map(a => a.hex))

  // Zapytanie 2: uzupełnienie geograficzne — łapie maszyny nieoznaczone na
  // listach /mil: wojskowe (po hex/callsign), służbowe śmigłowce oraz duże
  // samoloty (B747/An-124). Jedno zapytanie ze środka Polski pokrywa kraj.
  let supplementAircraft = []
  try {
    supplementAircraft = (await fetchAdsbfiGeo()).flatMap(a => {
      if (!isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax) || !passesTypeNoise(a)) return []
      if (milHexes.has(a.hex)) return []
      const kind = isMilitaryADSBfiRecord(a) ? 'mil' : classifyExtra(a)
      return kind ? [{ ...a, _kind: kind }] : []
    })
  } catch { /* uzupełnienie jest najlepszym-efortem */ }

  const ac = [...milAircraft, ...supplementAircraft].map(mapADSBfiRecord)
  return { aircraft: ac, _source: 'adsbfi' }
}

export const handler = async (event) => {
  connectLambda(event)
  const headers = corsHeaders(event)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  const params = event.queryStringParameters || {}
  const { lat, lon, radius, hex } = params

  // Tryb pobierania trasy konkretnego samolotu — czytamy z naszego bloba.
  // Trasa rośnie podczas:
  //   - aktywnego pollingu klienta (co 5 s, próbka 15 s)
  //   - scheduled `collect` cron (co 2 min, w tle)
  // saveTrails pomija on_ground, więc przerwa > FLIGHT_SPLIT_GAP_MS w danych
  // odpowiada okresowi na ziemi (lub utracie zasięgu ADS-B) — traktujemy ją
  // jako granicę między lotami i zwracamy TYLKO bieżący lot.
  if (hex) {
    // `hex` becomes a blob store key — reject anything that isn't a real
    // 6-digit ICAO address so a crafted value can't probe the store.
    if (!/^[0-9a-f]{6}$/i.test(hex)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nieprawidłowy hex' }) }
    }
    const lowerHex = hex.toLowerCase()
    let blobError = null
    let allPoints = []
    try {
      const data = await getStore('aircraft-trails').get(lowerHex, { type: 'json' })
      allPoints = data?.points || []
    } catch (err) {
      blobError = err.message
    }

    allPoints.sort((a, b) => a.ts - b.ts)
    // Cap to most-recent N points so a 4-hour flight doesn't return 50 KB
    // of JSON on every refresh — visual fidelity from 500 polyline vertices
    // is plenty for any realistic flight.
    const TRAIL_RESPONSE_MAX_POINTS = 500
    const wholeFlight = filterMlatSpikes(filterImplausibleJumps(currentFlightOnly(allPoints, Date.now())))
    const currentFlight = wholeFlight.slice(-TRAIL_RESPONSE_MAX_POINTS)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        trail: currentFlight,
        // Początek lotu liczony PRZED przycięciem do 500 punktów — inaczej
        // czas lotu na karcie maleje przy długich lotach.
        flightStartTs: wholeFlight[0]?.ts || null,
        sources: {
          blob: currentFlight.length,
          blobTotal: allPoints.length,
          blobError,
          blobFirstTs: currentFlight[0]?.ts || null,
          blobLastTs: currentFlight[currentFlight.length - 1]?.ts || null,
        },
      }),
    }
  }

  const latN = Number(lat)
  const lonN = Number(lon)
  const radiusKm = Number(radius) || 100

  if (!lat || !lon || isNaN(latN) || isNaN(lonN)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Brak parametrów lat/lon' }) }
  }

  const degLat = radiusKm / 111
  const degLon = radiusKm / (111 * Math.cos(latN * Math.PI / 180))
  const lamin = latN - degLat
  const lamax = latN + degLat
  const lomin = lonN - degLon
  const lomax = lonN + degLon

  // Cache odpowiedzi: klienci odpytują co 5 s, a adsb.fi limituje ~1 req/s —
  // bez cache zapytanie geo (drugie po /mil) ciągle dostaje 429 i znikają
  // helikoptery/heavy. Trzymamy wspólny snapshot ~9 s, więc adsb.fi jest pytane
  // najwyżej raz na ~9 s niezależnie od liczby klientów.
  const snapKey = snapshotKey(latN, lonN, radiusKm)
  let snapStore = null
  try { snapStore = getStore('aircraft-snapshot') } catch {}
  if (snapStore) {
    try {
      const cached = await snapStore.get(snapKey, { type: 'json' })
      if (cached && Date.now() - cached.ts < SNAPSHOT_TTL_MS && cached.source !== 'unavailable') {
        return { statusCode: 200, headers, body: JSON.stringify({ aircraft: cached.aircraft, _source: cached.source, _cached: true }) }
      }
    } catch { /* brak cache → pobierz świeżo */ }
  }

  let result = await tryADSBfi(lamin, lomin, lamax, lomax)
    || await tryOpenSky(lamin, lomin, lamax, lomax)

  // Oba źródła padły (najczęściej limit zapytań adsb.fi po serii wywołań).
  // Pusta lista czyściła wtedy całą mapę na jeden cykl, a po chwili maszyny
  // wracały. Lepiej oddać ostatnią dobrą migawkę i oznaczyć ją jako starszą —
  // kilka minut nieaktualnych pozycji mówi więcej niż puste niebo.
  if (!result) {
    let stale = null
    if (snapStore) {
      try { stale = await snapStore.get(snapKey, { type: 'json' }) } catch { /* brak migawki */ }
    }
    result = staleFallback(stale, Date.now())
  }

  // Jumbo jety do 100 km od granic: zapytanie geo adsb.fi sięga tylko 250 nm od
  // środka Polski, więc brzegi bierzemy z migawki crona heavy-collect (adsb.lol po typie).
  if (Array.isArray(result.aircraft)) {
    try {
      const heavy = await getStore(HEAVY_STORE).get(HEAVY_KEY, { type: 'json' })
      result = { ...result, aircraft: mergeHeavies(result.aircraft, heavy, { lamin, lomin, lamax, lomax }, mapADSBfiRecord) }
    } catch { /* bez migawki — tylko jumbo jety blisko Polski */ }
  }

  // Migawki awaryjnej NIE zapisujemy z nowym znacznikiem czasu: inaczej każde
  // nieudane pobranie odmładzałoby ją o kolejne 10 minut i przy dłuższej
  // awarii źródeł mapa mogłaby tkwić na zamrożonych pozycjach bez końca.
  if (snapStore && !result._stale && result._source !== 'unavailable') {
    await snapStore.set(snapKey, JSON.stringify({ ts: Date.now(), aircraft: result.aircraft, source: result._source })).catch(() => {})
  }

  // Trails are also collected by the `collect` cron every 2 min. The live
  // handler runs on every uncached client fetch (~every 10 s while anyone is
  // watching), so writing trails here on every call just duplicated the cron's
  // work. Throttle to once per 60 s per warm instance — enough to keep the
  // server trail denser than the cron alone, without the per-fetch overhead.
  // Z tego samego powodu stare pozycje nie mogą dopisywać się do tras —
  // byłyby w nich nowym punktem w miejscu, w którym maszyny już nie ma.
  if (!result._stale && Date.now() - lastLiveTrailSave >= LIVE_TRAIL_SAVE_INTERVAL_MS) {
    lastLiveTrailSave = Date.now()
    await Promise.race([saveTrails(result.aircraft).catch(() => {}), new Promise(r => setTimeout(r, 3000))])
  }

  return {
    statusCode: 200,
    // Every client polls the same fixed bbox (EUROPE_CENTER / 2800 km), so let
    // Netlify's CDN collapse concurrent requests into one origin hit. s-maxage=10
    // matches the client's 10 s poll — no staleness beyond one cycle.
    headers: { ...headers, 'Cache-Control': 'public, max-age=0, s-maxage=10' },
    body: JSON.stringify(result)
  }
}

// Throttle for live-handler trail writes (see handler above). Module-level so
// it persists across warm invocations of the same lambda instance.
const LIVE_TRAIL_SAVE_INTERVAL_MS = 60_000
let lastLiveTrailSave = 0

export async function saveTrails(aircraft) {
  if (!aircraft?.length) return
  const store = getStore('aircraft-trails')
  const now = Date.now()

  // Load from blob only for aircraft not yet in the in-memory cache (cold start / new aircraft)
  const uncached = aircraft.filter(ac => ac.lat != null && ac.lon != null && !trailCache.has(ac.hex))
  await Promise.allSettled(uncached.map(async ac => {
    let existing = null
    try { existing = await store.get(ac.hex, { type: 'json' }) } catch {}
    trailCache.set(ac.hex, {
      points: (existing?.points || []).filter(p => now - p.ts < TRAIL_MAX_AGE_MS),
      flight: ac.flight,
      t: ac.t,
    })
  }))

  // Determine which aircraft need a new trail point written.
  // Grounded aircraft are skipped — their gap in the trail data is what
  // lets us detect the boundary between flights server-side. MLAT positions
  // are saved too (many military transports, tankers and AWACS are MLAT-only
  // and had no trail at all), but less often and marked `m: 1` so that
  // filterMlatSpikes can drop the occasional sideways jump when reading.
  const toWrite = []
  for (const ac of aircraft) {
    if (ac.lat == null || ac.lon == null) continue
    if (ac.on_ground) continue
    const entry = trailCache.get(ac.hex)
    if (!entry) continue
    entry.points = entry.points.filter(p => now - p.ts < TRAIL_MAX_AGE_MS)
    const last = entry.points[entry.points.length - 1]
    const minInterval = ac.mlat ? MLAT_MIN_INTERVAL_MS : TRAIL_MIN_INTERVAL_MS
    if (!last || now - last.ts >= minInterval) {
      entry.points.push({ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro, ts: now, ...(ac.mlat ? { m: 1 } : {}) })
      entry.flight = ac.flight
      entry.t = ac.t
      toWrite.push(ac.hex)
    }
  }

  // Write only those that changed (parallel)
  await Promise.allSettled(toWrite.map(hex =>
    store.set(hex, JSON.stringify(trailCache.get(hex)))
  ))

  // Evict stale entries so the in-memory cache doesn't grow unbounded across
  // the lifetime of a warm lambda — an aircraft that vanished from the feed
  // would otherwise linger forever. Drop anything whose newest point is older
  // than TRAIL_MAX_AGE_MS.
  for (const [hex, entry] of trailCache) {
    const last = entry.points[entry.points.length - 1]
    if (!last || now - last.ts >= TRAIL_MAX_AGE_MS) trailCache.delete(hex)
  }
}

