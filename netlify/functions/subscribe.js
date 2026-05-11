import { getStore } from '@netlify/blobs'
import crypto from 'crypto'

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { subscription, lat, lon, radius } = JSON.parse(event.body || '{}')

    if (!subscription?.endpoint) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing subscription' }) }
    }

    const key = crypto.createHash('sha256')
      .update(subscription.endpoint)
      .digest('hex')
      .slice(0, 32)

    const store = getStore('push-subscriptions')

    // Preserve existing lat/lon if new values are missing (GPS not yet available)
    let existing = null
    try { existing = await store.get(key, { type: 'json' }) } catch {}

    const newLat = lat ?? existing?.lat ?? null
    const newLon = lon ?? existing?.lon ?? null
    const hasGps = newLat != null && newLon != null

    await store.set(key, JSON.stringify({
      subscription,
      lat: newLat,
      lon: newLon,
      radius: radius ?? existing?.radius ?? 100,
      updatedAt: lat != null ? Date.now() : (existing?.updatedAt ?? Date.now()),
      createdAt: existing?.createdAt ?? Date.now(),
    }))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, key, hasGps }),
    }
  } catch (err) {
    console.error('Subscribe error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
