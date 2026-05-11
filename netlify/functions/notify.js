import { getStore, connectLambda } from '@netlify/blobs'
import webpush from 'web-push'
import { fetchMilitaryNear, haversine } from './lib/military.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:admin@example.com'

const MAX_POSITION_AGE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

export const handler = async (event) => {
  try { if (event?.blobs) connectLambda(event) } catch {}
  const runStart = Date.now()
  const stats = {
    startedAt: new Date(runStart).toISOString(),
    vapidConfigured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    vapidSubject: VAPID_EMAIL,
    totalSubs: 0,
    skippedNoGps: 0,
    skippedStaleGps: 0,
    skippedInvalid: 0,
    processed: 0,
    notificationsSent: 0,
    pushErrors: 0,
    expiredRemoved: 0,
    perSub: [],
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('[notify] VAPID keys not configured, skipping run')
    stats.error = 'VAPID not configured'
    await writeRunStats(stats, runStart)
    return { statusCode: 200, body: JSON.stringify(stats) }
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  let subsStore, alertedStore, blobs
  try {
    subsStore = getStore('push-subscriptions')
    alertedStore = getStore('push-alerted')
    const result = await subsStore.list()
    blobs = result.blobs
  } catch (err) {
    console.error('[notify] Failed to access Blobs:', err.message)
    stats.error = `Blobs error: ${err.message}`
    return { statusCode: 500, body: JSON.stringify(stats) }
  }

  stats.totalSubs = blobs?.length || 0
  if (!blobs?.length) {
    console.log('[notify] No subscriptions in store')
    await writeRunStats(stats, runStart)
    return { statusCode: 200, body: JSON.stringify(stats) }
  }

  const results = await Promise.allSettled(blobs.map(({ key }) =>
    processSubscription(key, subsStore, alertedStore, stats)
  ))

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      stats.notificationsSent += r.value.sent || 0
      stats.pushErrors += r.value.errors || 0
    }
  }

  stats.durationMs = Date.now() - runStart
  console.log(`[notify] Run complete: ${JSON.stringify({
    totalSubs: stats.totalSubs,
    processed: stats.processed,
    skippedNoGps: stats.skippedNoGps,
    skippedStaleGps: stats.skippedStaleGps,
    skippedInvalid: stats.skippedInvalid,
    notificationsSent: stats.notificationsSent,
    pushErrors: stats.pushErrors,
    expiredRemoved: stats.expiredRemoved,
    durationMs: stats.durationMs,
  })}`)

  await writeRunStats(stats, runStart)
  return { statusCode: 200, body: JSON.stringify(stats) }
}

async function writeRunStats(stats, runStart) {
  try {
    const runsStore = getStore('push-runs')
    // Keep only the latest run summary
    await runsStore.set('latest', JSON.stringify(stats))
    // Plus a per-run snapshot keyed by timestamp (for history)
    await runsStore.set(`run-${runStart}`, JSON.stringify(stats))
  } catch (err) {
    console.error('[notify] Failed to write run stats:', err.message)
  }
}

async function processSubscription(key, subsStore, alertedStore, stats) {
  const result = { sent: 0, errors: 0 }
  const subDiag = { key, status: 'unknown' }

  try {
    const raw = await subsStore.get(key, { type: 'json' })
    if (!raw?.subscription) {
      stats.skippedInvalid++
      subDiag.status = 'invalid-no-subscription'
      stats.perSub.push(subDiag)
      return result
    }

    if (raw.lat == null || raw.lon == null) {
      stats.skippedNoGps++
      subDiag.status = 'skipped-no-gps'
      subDiag.createdAt = raw.createdAt
      stats.perSub.push(subDiag)
      return result
    }

    const ageMs = Date.now() - (raw.updatedAt || 0)
    if (ageMs > MAX_POSITION_AGE_MS) {
      stats.skippedStaleGps++
      subDiag.status = 'skipped-stale-gps'
      subDiag.gpsAgeMs = ageMs
      stats.perSub.push(subDiag)
      return result
    }

    const { subscription, lat, lon, radius = 100 } = raw
    stats.processed++

    const [aircraft, alertedRaw] = await Promise.all([
      fetchMilitaryNear(lat, lon, radius),
      alertedStore.get(key, { type: 'json' }).catch(() => null),
    ])

    const previousHexes = new Set(alertedRaw?.hexes || [])
    const currentHexes = new Set(aircraft.map(a => a.hex))
    const newAircraft = aircraft.filter(a => !previousHexes.has(a.hex))

    subDiag.status = 'processed'
    subDiag.gpsAgeMs = ageMs
    subDiag.radius = radius
    subDiag.inRange = aircraft.length
    subDiag.newAircraft = newAircraft.length

    const endpoint = subscription.endpoint || ''
    subDiag.pushProvider = endpoint.includes('apple.com') ? 'apple'
      : endpoint.includes('fcm.googleapis.com') ? 'fcm'
      : endpoint.includes('mozilla.com') ? 'mozilla'
      : 'other'

    for (const ac of newAircraft.slice(0, 3)) {
      const dist = Math.round(haversine(lat, lon, ac.lat, ac.lon))
      const payload = JSON.stringify({
        title: 'Wojskowy samolot w zasięgu!',
        body: `${ac.flight?.trim() || ac.hex}${ac.t ? ` (${ac.t})` : ''} — ${dist} km od Ciebie`,
        tag: ac.hex,
        hex: ac.hex,
      })
      try {
        await webpush.sendNotification(subscription, payload)
        result.sent++
        console.log(`[notify] Push OK ${subDiag.pushProvider} ${key} hex=${ac.hex} dist=${dist}km`)
      } catch (err) {
        result.errors++
        const status = err.statusCode || 0
        console.error(`[notify] Push FAIL ${subDiag.pushProvider} ${key} hex=${ac.hex} status=${status} msg=${err.message}`)
        if (status === 410 || status === 404) {
          await subsStore.delete(key).catch(() => {})
          await alertedStore.delete(key).catch(() => {})
          stats.expiredRemoved++
          subDiag.status = 'expired-removed'
          stats.perSub.push(subDiag)
          return result
        }
        subDiag.lastPushError = { status, msg: err.message }
      }
    }

    await alertedStore.set(key, JSON.stringify({ hexes: [...currentHexes], ts: Date.now() }))
    subDiag.sent = result.sent
    subDiag.errors = result.errors
    stats.perSub.push(subDiag)
    return result
  } catch (err) {
    console.error(`[notify] Error processing ${key}:`, err.message)
    subDiag.status = 'exception'
    subDiag.error = err.message
    stats.perSub.push(subDiag)
    return result
  }
}
