// Jumbo jety i An-124 lecące do Rzeszowa albo Krakowa.
//
// Dwa zewnętrzne źródła, oba darmowe i społecznościowe:
//   - adsb.lol  /v2/type/{typ} — globalnie wszystkie maszyny danego typu
//     (adsb.fi, z którego korzysta reszta aplikacji, nie ma pytania po typie,
//     a nasz zwykły pobór obejmuje tylko okolice Polski),
//   - adsbdb.com /v0/callsign/{znak} — trasa lotu; ADS-B nie niesie celu.
//
// Zapytania idą wyłącznie stąd i mają pamięć podręczną, więc ruch na stronie
// nie przekłada się na obciążenie tych serwisów: jeden przebieg to sześć
// zapytań o typy i tylko tyle zapytań o trasy, ile nowych znaków
// wywoławczych (trasa raz poznana leży w Blobs przez dobę).

import { getStore, connectLambda } from '@netlify/blobs'
import { corsHeaders } from './lib/security.js'
import {
  WATCHED_TYPES, ARRIVAL_AIRPORTS, etaMinutes, distanceKm,
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

// Migawka leży w Blobs, żeby czytał ją też cron powiadomień — inaczej każdy
// przebieg notify (co minutę) musiałby sam pytać adsb.lol.
export const SNAPSHOT_STORE = 'inbound-snapshot'
export const SNAPSHOT_KEY = 'latest'

export async function collect() {
  let store = null
  try { store = getStore('flight-routes') } catch { /* bez cache też zadziała */ }

  // Typy pobieramy po kolei, z odstępem — adsb.lol to serwis społecznościowy
  // i po trzech zapytaniach pod rząd zaczyna odpowiadać 429.
  const seen = new Map()
  for (const type of WATCHED_TYPES) {
    for (const a of await fetchType(type)) {
      if (!seen.has(a.hex)) seen.set(a.hex, a)
    }
    await sleep(1200)
  }

  const out = []
  for (const a of seen.values()) {
    const callsign = (a.flight || '').trim()
    const route = await fetchRoute(callsign, store)
    if (!route || !DEST.has(route.to)) continue
    const airport = ARRIVAL_AIRPORTS.find(x => x.icao === route.to)
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
      // Najpierw migawka z crona (inbound-collect co 10 min) — wtedy otwarcie
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
