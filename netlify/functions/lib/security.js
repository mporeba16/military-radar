import { getStore } from '@netlify/blobs'

const ALLOWED_ORIGINS = new Set([
  'https://radar-wojskowy.netlify.app',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:8888',
])

export function corsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://radar-wojskowy.netlify.app'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  }
}

// Push subscription endpoints come from one of a small set of push providers.
// Reject anything else so a malicious client can't make us call arbitrary URLs.
const VALID_ENDPOINT_HOSTS = [
  'web.push.apple.com',
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
]

export function isValidPushEndpoint(url) {
  if (typeof url !== 'string' || url.length > 2048) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return VALID_ENDPOINT_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

// Simple rate limiter backed by Netlify Blobs. Best-effort — Blobs is
// eventually-consistent, so concurrent calls may sneak through, but it
// stops casual abuse and accidental client loops.
export async function rateLimit({ key, windowMs }) {
  try {
    const store = getStore('rate-limit')
    const last = await store.get(key, { type: 'json' }).catch(() => null)
    const now = Date.now()
    if (last?.ts && now - last.ts < windowMs) {
      return { allowed: false, retryAfterMs: windowMs - (now - last.ts) }
    }
    await store.set(key, JSON.stringify({ ts: now }))
    return { allowed: true }
  } catch {
    // Fail open — don't break the endpoint if the rate-limit store glitches.
    return { allowed: true }
  }
}
