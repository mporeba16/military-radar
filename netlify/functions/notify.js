import { getStore, connectLambda } from '@netlify/blobs'
import webpush from 'web-push'
import { fetchMilitaryNear, haversine } from './lib/military.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:admin@example.com'

const MAX_POSITION_AGE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const CLOSE_RANGE_KM = 10
// Don't re-alert the same aircraft within this window. The timestamp is
// refreshed every run while the plane stays in range, so the cooldown is
// effectively measured from when it LEAVES — a brief drop-out won't re-alert.
const ALERT_COOLDOWN_MS = 45 * 60 * 1000
const FAR_LIST_MAX = 5            // max names listed in the grouped far push
const MAX_COVERAGE_KM = 1500      // clamp for the shared fetch bounding circle

// Polish numeral agreement for "samolot"
function planeWord(n) {
  if (n === 1) return 'wojskowy samolot'
  const t = n % 10, h = n % 100
  if (t >= 2 && t <= 4 && !(h >= 12 && h <= 14)) return 'wojskowe samoloty'
  return 'wojskowych samolotów'
}

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

  // Pass 1 — load every subscription and classify. We need locations up front
  // so we can fetch the military snapshot ONCE for all of them instead of
  // hitting the API per subscription (the /mil query is identical for everyone).
  const loaded = await Promise.all(blobs.map(async ({ key }) => ({
    key,
    raw: await subsStore.get(key, { type: 'json' }).catch(() => null),
  })))

  const valid = []
  for (const { key, raw } of loaded) {
    if (!raw?.subscription) {
      stats.skippedInvalid++
      stats.perSub.push({ key, status: 'invalid-no-subscription' })
      continue
    }
    if (raw.lat == null || raw.lon == null) {
      stats.skippedNoGps++
      stats.perSub.push({ key, status: 'skipped-no-gps', createdAt: raw.createdAt })
      continue
    }
    const ageMs = Date.now() - (raw.updatedAt || 0)
    if (ageMs > MAX_POSITION_AGE_MS) {
      stats.skippedStaleGps++
      stats.perSub.push({ key, status: 'skipped-stale-gps', gpsAgeMs: ageMs })
      continue
    }
    valid.push({ key, raw, ageMs })
  }

  // Shared fetch: one bounding circle (centroid + reach) covering all subs.
  // adsb.fi /mil is global so tagged military is always covered; the geographic
  // supplement is capped at ~250nm from the centroid, so subs far from the
  // centroid may miss callsign-only matches — fine for a Poland-focused app.
  let snapshot = []
  if (valid.length) {
    const cLat = valid.reduce((s, v) => s + v.raw.lat, 0) / valid.length
    const cLon = valid.reduce((s, v) => s + v.raw.lon, 0) / valid.length
    let coverage = 0
    for (const v of valid) {
      coverage = Math.max(coverage, haversine(cLat, cLon, v.raw.lat, v.raw.lon) + (v.raw.radius ?? 100))
    }
    coverage = Math.min(Math.ceil(coverage), MAX_COVERAGE_KM)
    snapshot = await fetchMilitaryNear(cLat, cLon, coverage)
    stats.snapshotCount = snapshot.length
    stats.coverageKm = coverage
  }

  // Pass 2 — filter the shared snapshot to each sub's own bubble and process.
  const results = await Promise.allSettled(valid.map((v) => {
    const radius = v.raw.radius ?? 100
    const aircraft = snapshot.filter(a => haversine(v.raw.lat, v.raw.lon, a.lat, a.lon) <= radius)
    return processSubscription(v, aircraft, subsStore, alertedStore, stats)
  }))

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
    snapshotCount: stats.snapshotCount,
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

async function processSubscription({ key, raw, ageMs }, aircraft, subsStore, alertedStore, stats) {
  const result = { sent: 0, errors: 0 }
  const subDiag = { key, status: 'processed' }

  try {
    const { subscription, lat, lon, radius = 100 } = raw
    stats.processed++
    const now = Date.now()

    const alertedRaw = await alertedStore.get(key, { type: 'json' }).catch(() => null)
    // Migrate legacy formats (the old `hexes` array, or the interim far/near
    // arrays) into timestamp maps, treating known hexes as just-alerted so a
    // deploy doesn't trigger an alert storm.
    const toMap = (v) => {
      if (!v) return {}
      if (Array.isArray(v)) { const m = {}; for (const h of v) m[h] = now; return m }
      return { ...v }
    }
    const prevFar = toMap(alertedRaw?.far ?? alertedRaw?.hexes)
    const prevNear = toMap(alertedRaw?.near)
    const eligible = (map, hex) => !map[hex] || (now - map[hex]) > ALERT_COOLDOWN_MS

    const enriched = aircraft.map(a => ({ ...a, _dist: Math.round(haversine(lat, lon, a.lat, a.lon)) }))
    const nearNow = enriched.filter(a => a._dist <= CLOSE_RANGE_KM)
    const farNow = enriched.filter(a => a._dist > CLOSE_RANGE_KM)
    const newNear = nearNow.filter(a => eligible(prevNear, a.hex))
    const newFar = farNow.filter(a => eligible(prevFar, a.hex))

    subDiag.gpsAgeMs = ageMs
    subDiag.radius = radius
    subDiag.inRange = aircraft.length
    subDiag.newAircraft = newFar.length
    subDiag.newNearAircraft = newNear.length

    const endpoint = subscription.endpoint || ''
    subDiag.pushProvider = endpoint.includes('apple.com') ? 'apple'
      : endpoint.includes('fcm.googleapis.com') ? 'fcm'
      : endpoint.includes('mozilla.com') ? 'mozilla'
      : 'other'

    const send = async (payload, logLabel) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload))
        result.sent++
        console.log(`[notify] Push OK ${subDiag.pushProvider} ${key} ${logLabel}`)
        return {}
      } catch (err) {
        result.errors++
        const status = err.statusCode || 0
        console.error(`[notify] Push FAIL ${subDiag.pushProvider} ${key} ${logLabel} status=${status} msg=${err.message}`)
        if (status === 410 || status === 404) return { expired: true }
        subDiag.lastPushError = { status, msg: err.message }
        return {}
      }
    }
    const cleanupExpired = async () => {
      await subsStore.delete(key).catch(() => {})
      await alertedStore.delete(key).catch(() => {})
      stats.expiredRemoved++
      subDiag.status = 'expired-removed'
      stats.perSub.push(subDiag)
    }

    // Close-range alerts: individual and uncapped — they're the urgent ones.
    for (const ac of newNear) {
      const { expired } = await send({
        title: 'Wojskowy samolot blisko Ciebie!',
        body: `${ac.flight?.trim() || ac.hex}${ac.t ? ` (${ac.t})` : ''} — ${ac._dist} km od Ciebie`,
        tag: ac.hex,
        hex: ac.hex,
      }, `near hex=${ac.hex} dist=${ac._dist}km`)
      if (expired) { await cleanupExpired(); return result }
    }

    // Far-range alerts: collapsed into a single grouped push so a busy sky
    // doesn't fire a dozen separate notifications.
    if (newFar.length) {
      const sorted = [...newFar].sort((a, b) => a._dist - b._dist)
      const n = sorted.length
      let title, body, tag
      if (n === 1) {
        const ac = sorted[0]
        title = 'Wojskowy samolot w zasięgu!'
        body = `${ac.flight?.trim() || ac.hex}${ac.t ? ` (${ac.t})` : ''} — ${ac._dist} km od Ciebie`
        tag = ac.hex
      } else {
        const names = sorted.slice(0, FAR_LIST_MAX).map(a => a.flight?.trim() || a.hex)
        const extra = n - names.length
        title = `${n} ${planeWord(n)} w zasięgu!`
        body = `${names.join(', ')}${extra > 0 ? ` +${extra}` : ''} — od ${sorted[0]._dist} km`
        tag = 'mil-far-group'
      }
      const { expired } = await send({ title, body, tag, hex: sorted[0].hex }, `far group n=${n}`)
      if (expired) { await cleanupExpired(); return result }
    }

    // Refresh cooldown maps. Every in-range plane is stamped `now` (so the
    // cooldown counts from when it leaves); near implies far, so a close plane
    // never fires a retroactive far alert. Recently-departed entries are kept
    // until their cooldown lapses, then dropped to bound the map size.
    const nextFar = {}
    const nextNear = {}
    for (const a of farNow) nextFar[a.hex] = now
    for (const a of nearNow) { nextNear[a.hex] = now; nextFar[a.hex] = now }
    for (const [hex, ts] of Object.entries(prevFar)) {
      if (!(hex in nextFar) && now - ts <= ALERT_COOLDOWN_MS) nextFar[hex] = ts
    }
    for (const [hex, ts] of Object.entries(prevNear)) {
      if (!(hex in nextNear) && now - ts <= ALERT_COOLDOWN_MS) nextNear[hex] = ts
    }

    await alertedStore.set(key, JSON.stringify({ far: nextFar, near: nextNear, ts: now }))
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
