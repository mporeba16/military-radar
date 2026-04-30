import { getStore } from '@netlify/blobs'
import webpush from 'web-push'
import { fetchMilitaryNear, haversine } from './lib/military.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@example.com'

// Max age of stored GPS position — positions older than this are ignored
const MAX_POSITION_AGE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

export const handler = async () => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('VAPID keys not configured, skipping notify run')
    return { statusCode: 200, body: 'VAPID not configured' }
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const subsStore = getStore('push-subscriptions')
  const alertedStore = getStore('push-alerted')

  let blobs
  try {
    const result = await subsStore.list()
    blobs = result.blobs
  } catch (err) {
    console.error('Failed to list subscriptions:', err.message)
    return { statusCode: 500, body: 'Blobs error' }
  }

  if (!blobs?.length) {
    return { statusCode: 200, body: 'No subscriptions' }
  }

  let notified = 0

  for (const { key } of blobs) {
    try {
      const raw = await subsStore.get(key, { type: 'json' })
      if (!raw?.subscription || raw.lat == null || raw.lon == null) continue

      // Skip if position hasn't been updated recently
      if (Date.now() - (raw.updatedAt || 0) > MAX_POSITION_AGE_MS) continue

      const { subscription, lat, lon, radius = 100 } = raw

      // Fetch current military aircraft in radius
      const aircraft = await fetchMilitaryNear(lat, lon, radius)

      // Load previous alert state for this subscription
      const alertedRaw = await alertedStore.get(key, { type: 'json' }).catch(() => null)
      const previousHexes = new Set(alertedRaw?.hexes || [])
      const currentHexes = new Set(aircraft.map(a => a.hex))

      // Only notify for aircraft not already alerted this session
      const newAircraft = aircraft.filter(a => !previousHexes.has(a.hex))

      // Send at most 3 notifications per cycle to avoid flooding
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
            // Subscription expired or unsubscribed — clean up
            await subsStore.delete(key).catch(() => {})
            await alertedStore.delete(key).catch(() => {})
            console.log(`Removed expired subscription ${key}`)
          } else {
            console.error(`Push failed for ${key}:`, err.statusCode || err.message)
          }
        }
      }

      // Update alerted set — only keep currently present aircraft
      // (so if aircraft leaves and comes back, it triggers a new notification)
      await alertedStore.set(key, JSON.stringify({
        hexes: [...currentHexes],
        ts: Date.now(),
      }))

    } catch (err) {
      console.error(`Error processing subscription ${key}:`, err.message)
    }
  }

  console.log(`Notify run: ${blobs.length} subscriptions, ${notified} notifications sent`)
  return { statusCode: 200, body: `Processed ${blobs.length} subscriptions, sent ${notified} notifications` }
}
