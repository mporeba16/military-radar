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

    await store.set(key, JSON.stringify({
      subscription,
      lat: lat ?? null,
      lon: lon ?? null,
      radius: radius ?? 100,
      updatedAt: Date.now(),
    }))

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('Subscribe error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
