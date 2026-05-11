import { getStore } from '@netlify/blobs'
import crypto from 'crypto'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || null

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
    const { endpoint } = JSON.parse(event.body || '{}')
    if (!endpoint) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing endpoint' }) }
    }

    const key = crypto.createHash('sha256')
      .update(endpoint)
      .digest('hex')
      .slice(0, 32)

    const subsStore = getStore('push-subscriptions')
    const runsStore = getStore('push-runs')

    const [sub, latestRun] = await Promise.all([
      subsStore.get(key, { type: 'json' }).catch(() => null),
      runsStore.get('latest', { type: 'json' }).catch(() => null),
    ])

    const provider = endpoint.includes('apple.com') ? 'apple'
      : endpoint.includes('fcm.googleapis.com') ? 'fcm'
      : endpoint.includes('mozilla.com') ? 'mozilla'
      : 'other'

    const server = {
      vapidConfigured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
      vapidSubject: VAPID_SUBJECT || '(default mailto:admin@example.com)',
    }

    if (!sub) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          reason: 'not-registered',
          provider,
          server,
          latestRun: latestRunSummary(latestRun),
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
      }),
    }
  } catch (err) {
    console.error('Status error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) }
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
