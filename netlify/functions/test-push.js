import { getStore, connectLambda } from '@netlify/blobs'
import webpush from 'web-push'
import crypto from 'crypto'
import { corsHeaders, isValidPushEndpoint, rateLimit } from './lib/security.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:admin@example.com'

export const handler = async (event) => {
  connectLambda(event)
  const headers = corsHeaders(event)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'vapid-not-configured' }) }
  }

  let endpoint
  try {
    const body = JSON.parse(event.body || '{}')
    endpoint = body.endpoint
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-json', detail: err.message }) }
  }

  if (!endpoint || !isValidPushEndpoint(endpoint)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-endpoint' }) }
  }

  const key = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32)

  // 1 test push per 5 min per endpoint — stops anyone with a stolen endpoint
  // URL from spamming notifications to the owner.
  const rl = await rateLimit({ key: `tp-${key}`, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...headers, 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      body: JSON.stringify({ error: 'rate-limited', retryAfterMs: rl.retryAfterMs }),
    }
  }

  let sub
  try {
    const store = getStore('push-subscriptions')
    const record = await store.get(key, { type: 'json' })
    sub = record?.subscription
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'blobs-read-failed', detail: err.message }) }
  }

  if (!sub) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'subscription-not-found' }) }
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const payload = JSON.stringify({
    title: 'Test powiadomienia',
    body: 'Jeśli to widzisz — pushe z serwera działają.',
    tag: '__test_push__',
    hex: '__test_push__',
  })

  try {
    await webpush.sendNotification(sub, payload)
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: 'push-failed',
        statusCode: err.statusCode || null,
        detail: err.message,
      }),
    }
  }
}
