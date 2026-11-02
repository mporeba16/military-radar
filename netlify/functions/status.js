import { getStore, connectLambda } from '@netlify/blobs'
import { corsHeaders, isValidPushEndpoint, rateLimit } from './lib/security.js'
import { pushProvider, endpointKey, vapidConfig } from './lib/push.js'
import { HEALTH_STORE, HEALTH_KEY } from './lib/health.js'

export const handler = async (event) => {
  connectLambda(event)
  const headers = corsHeaders(event)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const vapid = vapidConfig()
  const server = {
    vapidConfigured: vapid.configured,
    vapidSubject: vapid.subject || '(default mailto:admin@example.com)',
  }

  let endpoint
  try {
    const body = JSON.parse(event.body || '{}')
    endpoint = body.endpoint
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-json', detail: err.message, server }) }
  }

  if (!endpoint || !isValidPushEndpoint(endpoint)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid-endpoint', server }) }
  }

  const key = endpointKey(endpoint)

  // The client polls status once a minute; a 5 s window stops anyone with a
  // stolen endpoint URL from hammering it without affecting normal use.
  const rl = await rateLimit({ key: `st-${key}`, windowMs: 5_000 })
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { ...headers, 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      body: JSON.stringify({ error: 'rate-limited', retryAfterMs: rl.retryAfterMs, server }),
    }
  }

  const provider = pushProvider(endpoint)

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

  // Stan systemu z alarmów o awariach — co teraz nie działa i od kiedy.
  let health = null
  try {
    const h = await getStore(HEALTH_STORE).get(HEALTH_KEY, { type: 'json' })
    health = Object.entries(h?.problems || {}).map(([id, p]) => ({ id, since: p.since, detail: p.detail }))
  } catch (err) {
    storeErrors.push(`health-read: ${err.message}`)
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
        health,
        storeErrors: storeErrors.length ? storeErrors : undefined,
      }),
    }
  }

  // Privacy: do NOT echo back lat/lon. Anyone who knows the endpoint URL
  // can query this — leaking GPS would let them track the owner.
  // Only return whether GPS is configured + how old it is.
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
      radius: sub.radius,
      gpsAgeMs: ageMs,
      createdAt: sub.createdAt,
      healthAlerts: sub.health === true,
      server,
      latestRun: latestRunSummary(latestRun),
      health,
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
