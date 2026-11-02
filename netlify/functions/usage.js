// Licznik użytkowników — szczegóły w lib/usage.js.
//   POST { id, standalone, push, platform } — sygnał „to urządzenie otworzyło
//        dziś aplikację" (klient wysyła go raz na dobę),
//   GET  — zbiorcze liczby (dziennie / tygodniowo / miesięcznie), bez żadnych
//        danych o pojedynczych urządzeniach; pokazuje je diagnostyka.

import { getStore, connectLambda } from '@netlify/blobs'
import { corsHeaders, cleanDeviceId } from './lib/security.js'
import { USAGE_STORE, warsawDay, deviceHash, usageRecord, lastDays, summarize } from './lib/usage.js'

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
  // Podział z ostatnich 7 dni: najnowszy wpis każdego urządzenia.
  const latest = new Map()
  for (const d of days.slice(0, 7).reverse()) {
    for (const h of keysByDay[d]) latest.set(h, `${d}/${h}`)
  }
  const recent7 = (await Promise.all([...latest.values()].map(k =>
    store.get(k, { type: 'json' }).catch(() => null)))).filter(Boolean)
  return summarize(keysByDay, recent7, now)
}

export const handler = async (event) => {
  connectLambda(event)
  const headers = corsHeaders(event)
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  const store = getStore(USAGE_STORE)
  const now = Date.now()

  if (event.httpMethod === 'GET') {
    if (!statsCache || now - statsCache.at > STATS_TTL_MS) {
      try {
        statsCache = { at: now, body: JSON.stringify(await computeStats(store, now)) }
      } catch (err) {
        console.error('[usage] stats:', err.message)
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'stats-failed' }) }
      }
    }
    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=0, s-maxage=600' }, body: statsCache.body }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-json' }) }
  }
  const id = cleanDeviceId(body.id)
  if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-id' }) }

  try {
    await store.set(`${warsawDay(now)}/${deviceHash(id)}`, JSON.stringify(usageRecord(body)))
  } catch (err) {
    console.error('[usage] zapis:', err.message)
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'store-failed' }) }
  }
  return { statusCode: 204, headers }
}
