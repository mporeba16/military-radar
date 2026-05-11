import { getStore, connectLambda } from '@netlify/blobs'
import crypto from 'crypto'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || null

export const handler = async (event) => {
  connectLambda(event)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const server = {
    vapidConfigured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    vapidSubject: VAPID_SUBJECT || '(default mailto:admin@example.com)',
  }

  let endpoint
  try {
    const body = JSON.parse(event.body || '{}')
    endpoint = body.endpoint
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-json', detail: err.message, server }) }
  }

  if (!endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'missing-endpoint', server }) }
  }

  let key
  try {
    key = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32)
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'hash-failed', detail: err.message, server }) }
  }

  const provider = endpoint.includes('apple.com') ? 'apple'
    : endpoint.includes('fcm.googleapis.com') ? 'fcm'
    : endpoint.includes('mozilla.com') ? 'mozilla'
    : 'other'

  let sub = null
  let latestRun = null
  let storeErrors = []

  try {
    const subsStore = getStore('push-subscriptions')
    sub = await subsStore.get(key, { type: 'json' }).catch(err => {
      storeErrors.push(`sub-read: ${err.message}`)
      return null
    })
  } catch (err) {
    storeErrors.push(`subs-store-init: ${err.message}`)
  }

  try {
    const runsStore = getStore('push-runs')
    latestRun = await runsStore.get('latest', { type: 'json' }).catch(err => {
      storeErrors.push(`runs-read: ${err.message}`)
      return null
    })
  } catch (err) {
    storeErrors.push(`runs-store-init: ${err.message}`)
  }

  if (!sub) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: false,
        reason: 'not-registered',
        provider,
        key,
        server,
        latestRun: latestRunSummary(latestRun),
        storeErrors: storeErrors.length ? storeErrors : undefined,
      }),
    }
  }

  const hasGps = sub.lat != null && sub.lon != null
  const ageMs = sub.updatedAt ? Date.now() - sub.updatedAt : null
  const stale = ageMs != null && ageMs > 7 * 24 * 60 * 60 * 1000

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ok: hasGps && !stale,
      reason: !hasGps ? 'no-gps' : stale ? 'stale-gps' : 'ready',
      provider,
      key,
      hasGps,
      lat: sub.lat,
      lon: sub.lon,
      radius: sub.radius,
      gpsAgeMs: ageMs,
      createdAt: sub.createdAt,
      server,
      latestRun: latestRunSummary(latestRun),
      storeErrors: storeErrors.length ? storeErrors : undefined,
    }),
  }
}

function latestRunSummary(run) {
  if (!run) return null
  return {
    startedAt: run.startedAt,
    totalSubs: run.totalSubs,
    processed: run.processed,
    skippedNoGps: run.skippedNoGps,
    skippedStaleGps: run.skippedStaleGps,
    notificationsSent: run.notificationsSent,
    pushErrors: run.pushErrors,
    vapidConfigured: run.vapidConfigured,
  }
}
