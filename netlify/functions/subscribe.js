import { getStore, connectLambda } from '@netlify/blobs'
import crypto from 'crypto'
import { corsHeaders, isValidPushEndpoint, rateLimit } from './lib/security.js'

export const handler = async (event) => {
  connectLambda(event)
  const headers = corsHeaders(event)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch (err) {
    console.error('[subscribe] JSON parse failed:', err.message)
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-json', detail: err.message }) }
  }

  // Wypisanie się z powiadomień — kasujemy rekord od razu (bez czekania, aż
  // APNS zwróci 410). Klient woła to przy wyłączaniu powiadomień w aplikacji.
  if (body.action === 'unsubscribe') {
    const ep = body.endpoint || body.subscription?.endpoint
    if (!ep) return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing-endpoint' }) }
    try {
      const delKey = crypto.createHash('sha256').update(ep).digest('hex').slice(0, 32)
      await getStore('push-subscriptions').delete(delKey)
      console.log(`[subscribe] unsubscribed key=${delKey}`)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, removed: true }) }
    } catch (err) {
      console.error('[subscribe] unsubscribe failed:', err.message)
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'unsub-failed', detail: err.message }) }
    }
  }

  const { subscription, lat, lon, radius, deviceId } = body

  if (!subscription?.endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing-endpoint' }) }
  }

  // Only accept endpoints from real push services. Stops a malicious client
  // from making us cache an attacker-controlled webhook URL.
  if (!isValidPushEndpoint(subscription.endpoint)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-endpoint-host' }) }
  }

  let key
  try {
    key = crypto.createHash('sha256')
      .update(subscription.endpoint)
      .digest('hex')
      .slice(0, 32)
  } catch (err) {
    console.error('[subscribe] Hash failed:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'hash-failed', detail: err.message }) }
  }

  // Throttle per-endpoint to 1 subscribe call per 10 s.
  const rl = await rateLimit({ key: `sub-${key}`, windowMs: 10_000 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...headers, 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      body: JSON.stringify({ error: 'rate-limited', retryAfterMs: rl.retryAfterMs }),
    }
  }

  let store
  try {
    store = getStore('push-subscriptions')
  } catch (err) {
    console.error('[subscribe] getStore failed:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'blobs-init-failed', detail: err.message }) }
  }

  let existing = null
  try {
    existing = await store.get(key, { type: 'json' })
  } catch (err) {
    console.error('[subscribe] get existing failed:', err.message)
  }

  const newLat = lat ?? existing?.lat ?? null
  const newLon = lon ?? existing?.lon ?? null
  const hasGps = newLat != null && newLon != null

  const record = {
    subscription,
    lat: newLat,
    lon: newLon,
    radius: radius ?? existing?.radius ?? 100,
    // Refresh freshness whenever we hold a usable position (new or carried
    // over), not only when a new fix arrives — an active client re-syncing
    // without GPS shouldn't drift into "stale" and get dropped by notify.
    updatedAt: hasGps ? Date.now() : (existing?.updatedAt ?? Date.now()),
    createdAt: existing?.createdAt ?? Date.now(),
    // Stabilny identyfikator urządzenia (z localStorage klienta) — pozwala
    // sprzątać stare endpointy po rotacji push (patrz niżej).
    deviceId: deviceId ?? existing?.deviceId ?? null,
  }

  let serialized
  try {
    serialized = JSON.stringify(record)
  } catch (err) {
    console.error('[subscribe] serialize failed:', err.message)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'serialize-failed', detail: err.message }) }
  }

  try {
    await store.set(key, serialized)
  } catch (err) {
    console.error('[subscribe] store.set failed:', err.message, err.stack)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'blobs-write-failed',
        detail: err.message,
        bytes: serialized.length,
      }),
    }
  }

  // Rotacja endpointu (iOS/APNS potrafi nadać nowy URL push) tworzy NOWY rekord,
  // a stary zostaje ze swoją (inną) pozycją GPS → to samo urządzenie dostaje
  // DWA powiadomienia o jednym samolocie, z różnym dystansem. Gdy to świeży
  // endpoint (brak `existing`), usuwamy pozostałe rekordy z tym samym deviceId.
  if (!existing && deviceId) {
    try {
      const { blobs } = await store.list()
      await Promise.allSettled((blobs || []).map(async b => {
        if (b.key === key) return
        const other = await store.get(b.key, { type: 'json' }).catch(() => null)
        if (other?.deviceId && other.deviceId === deviceId) {
          await store.delete(b.key).catch(() => {})
          console.log(`[subscribe] pruned stale endpoint key=${b.key} device=${deviceId}`)
        }
      }))
    } catch (err) {
      console.error('[subscribe] device-prune failed:', err.message)
    }
  }

  console.log(`[subscribe] OK key=${key} hasGps=${hasGps} lat=${newLat} lon=${newLon} radius=${record.radius}`)
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, key, hasGps }),
  }
}
