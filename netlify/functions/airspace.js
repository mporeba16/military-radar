// Strefy wojskowe z planu użytkowania przestrzeni PAŻP (AUP + UUP).
//
// Pośrednik, bo airspace.pansa.pl nie wysyła nagłówków CORS, a surowa
// odpowiedź waży ~500 kB (w każdej strefie gotowy HTML okienka). Tu zostają
// tylko strefy z rezerwacją wojskową, obrys i rezerwacje — kilkadziesiąt kB.
//
// Plan zmienia się rzadko (AUP raz na dobę, UUP kilka razy dziennie), więc
// pamięć podręczna 10 min w instancji plus CDN. Gdy PAŻP nie odpowiada,
// oddajemy ostatnią dobrą wersję, dopóki nie jest starsza niż 6 h.

import { corsHeaders } from './lib/security.js'
import { MIL_BASES_PL } from '../../src/airfields.js'
import { trimZones, milUnitSet } from '../../src/lib/airspace.js'

const SOURCE = 'https://airspace.pansa.pl/map-configuration'
const FRESH_MS = 10 * 60 * 1000
const STALE_MAX_MS = 6 * 60 * 60 * 1000
const MIL_ICAO = milUnitSet(MIL_BASES_PL)

let cache = null // { at, body }

async function fetchPlan(kind) {
  const res = await fetch(`${SOURCE}/${kind}`, {
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`${kind} http-${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`${kind} not an array`)
  return data
}

async function load() {
  // UUP bywa pusty lub niedostępny rano, zanim AMC wyda pierwszą poprawkę —
  // wtedy sam AUP wystarcza.
  const [aup, uup] = await Promise.allSettled([fetchPlan('aup'), fetchPlan('uup')])
  if (aup.status !== 'fulfilled') throw aup.reason
  const zones = trimZones(aup.value, uup.status === 'fulfilled' ? uup.value : [], MIL_ICAO)
  return JSON.stringify({ updated: new Date().toISOString(), zones })
}

export const handler = async (event) => {
  const headers = corsHeaders(event)
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const now = Date.now()
  if (!cache || now - cache.at > FRESH_MS) {
    try {
      cache = { at: now, body: await load() }
    } catch (err) {
      if (!cache || now - cache.at > STALE_MAX_MS) {
        console.error('[airspace]', err.message)
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'upstream' }) }
      }
    }
  }

  return {
    statusCode: 200,
    headers: { ...headers, 'Cache-Control': 'public, max-age=300, s-maxage=600' },
    body: cache.body,
  }
}
