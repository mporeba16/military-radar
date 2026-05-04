import { getStore } from '@netlify/blobs'
import webpush from 'web-push'
import { fetchMilitaryNear, haversine } from './lib/military.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:admin@example.com'

const MAX_POSITION_AGE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

export const handler = async () => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('VAPID keys not configured, skipping notify run')
    return { statusCode: 200, body: 'VAPID not configured' }
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  let subsStore, alertedStore, blobs
  try {
    subsStore = getStore('push-subscriptions')
    alertedStore = getStore('push-alerted')
    const result = await subsStore.list()
    blobs = result.blobs
  } catch (err) {
    console.error('Failed to access Blobs:', err.message)
    return { statusCode: 500, body: 'Blobs error' }
  }

  if (!blobs?.length) {
    return { statusCode: 200, body: 'No subscriptions' }
  }

  const results = await Promise.allSettled(blobs.map(({ key }) =>
    processSubscription(key, subsStore, alertedStore)
  ))

  const notified = results.reduce((sum, r) => sum + (r.value ?? 0), 0)
  console.log(`Notify run: ${blobs.length} subscriptions, ${notified} notifications sent`)
  return { statusCode: 200, body: `Processed ${blobs.length} subscriptions, sent ${notified} notifications` }
}

async function processSubscription(key, subsStore, alertedStore) {
  try {
    const raw = await subsStore.get(key, { type: 'json' })
    if (!raw?.subscription || raw.lat == null || raw.lon == null) return 0
    if (Date.now() - (raw.updatedAt || 0) > MAX_POSITION_AGE_MS) return 0

    const { subscription, lat, lon, radius = 100 } = raw

    const [aircraft, alertedRaw] = await Promise.all([
      fetchMilitaryNear(lat, lon, radius),
      alertedStore.get(key, { type: 'json' }).catch(() => null),
    ])

    const previousHexes = new Set(alertedRaw?.hexes || [])
    const currentHexes = new Set(aircraft.map(a => a.hex))
    const newAircraft = aircraft.filter(a => !previousHexes.has(a.hex))

    let notified = 0
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
        notified++
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await subsStore.delete(key).catch(() => {})
          await alertedStore.delete(key).catch(() => {})
          console.log(`Removed expired subscription ${key}`)
          return notified
        }
        console.error(`Push failed for ${key}:`, err.statusCode || err.message)
      }
    }

    await alertedStore.set(key, JSON.stringify({ hexes: [...currentHexes], ts: Date.now() }))
    return notified
  } catch (err) {
    console.error(`Error processing subscription ${key}:`, err.message)
    return 0
  }
}
