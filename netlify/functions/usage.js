// Licznik użytkowników — szczegóły w lib/usage.js.
//   POST { id, standalone, push, platform } — sygnał „to urządzenie otworzyło
//        dziś aplikację" (klient wysyła go raz na dobę),
//   GET  — liczby dzienne / tygodniowe / miesięczne i lista urządzeń z 14 dni
//        (platforma, przybliżone miasto, godzina) — bez identyfikatorów;
//        pokazują je Statystyki.

import { getStore } from '@netlify/blobs'
import { corsHeaders, cleanDeviceId } from './lib/security.js'
import { USAGE_STORE, warsawDay, deviceHash, usageRecord, geoFromContext, geoFromHeaders, lastDays, summarize } from './lib/usage.js'

// Liczenie to 30 list kluczy w Blobs — wynik trzymamy w instancji i w CDN.
const STATS_TTL_MS = 10 * 60 * 1000
let statsCache = null // { at, body }

async function computeStats(store, now) {
  const days = lastDays(30, now)
  const keysByDay = {}
  await Promise.all(days.map(async d => {
    const { blobs } = await store.list({ prefix: `${d}/` })
    keysByDay[d] = (blobs || []).map(b => b.key.slice(d.length + 1))
  }))
  // Rekordy z 14 dni wykresu — z nich podział każdego dnia na platformy.
  // Kilkadziesiąt odczytów, a liczymy tylko przy otwarciu Statystyk.
  const recordsByDay = {}
  await Promise.all(days.slice(0, 14).map(async d => {
    recordsByDay[d] = (await Promise.all(keysByDay[d].map(h =>
      store.get(`${d}/${h}`, { type: 'json' }).catch(() => null)))).filter(Boolean)
  }))
  return summarize(keysByDay, recordsByDay, now)
}

// Format `export default` (Request + context), nie `handler`: tylko on dostaje
// od Netlify pełne położenie (context.geo z miastem). Stary format dostawał
// sam kraj — na produkcji każde urządzenie miało „lokalizacja nieznana",
// choć lokalnie (netlify dev) miasto było.
export default async (req, context) => {
  const headers = corsHeaders({ headers: { origin: req.headers.get('origin') } })
  const reply = (status, body = null, extra = {}) =>
    new Response(body, { status, headers: { ...headers, ...extra } })
  if (req.method === 'OPTIONS') return reply(204)
  const store = getStore(USAGE_STORE)
  const now = Date.now()

  if (req.method === 'GET') {
    if (!statsCache || now - statsCache.at > STATS_TTL_MS) {
      try {
        statsCache = { at: now, body: JSON.stringify(await computeStats(store, now)) }
      } catch (err) {
        console.error('[usage] stats:', err.message)
        return reply(502, JSON.stringify({ error: 'stats-failed' }))
      }
    }
    return reply(200, statsCache.body, { 'Cache-Control': 'public, max-age=0, s-maxage=600' })
  }

  if (req.method !== 'POST') return reply(405, JSON.stringify({ error: 'Method not allowed' }))

  let body
  try { body = JSON.parse(await req.text() || '{}') } catch {
    return reply(400, JSON.stringify({ error: 'invalid-json' }))
  }
  const id = cleanDeviceId(body.id)
  if (!id) return reply(400, JSON.stringify({ error: 'invalid-id' }))

  try {
    const key = `${warsawDay(now)}/${deviceHash(id)}`
    // Ponowny sygnał tego samego dnia (np. uzupełnienie miasta po wdrożeniu)
    // nie przesuwa godziny pierwszego otwarcia.
    const prev = await store.get(key, { type: 'json' }).catch(() => null)
    const rec = usageRecord(body, geoFromContext(context) ?? geoFromHeaders(Object.fromEntries(req.headers)), now)
    if (prev?.at) rec.at = prev.at
    await store.set(key, JSON.stringify(rec))
  } catch (err) {
    console.error('[usage] zapis:', err.message)
    return reply(502, JSON.stringify({ error: 'store-failed' }))
  }
  return reply(204)
}
