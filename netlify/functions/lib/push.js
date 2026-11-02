// Drobiazgi wspólne dla wysyłki push (notify, test-push), zapisu
// subskrypcji (subscribe) i diagnostyki (status).
import { getStore } from '@netlify/blobs'
import crypto from 'crypto'

// Klucz rekordu subskrypcji (i jej mapy cooldownu) w Blobs — skrót adresu
// push. Wcześniej każda funkcja liczyła go po swojemu, w czterech kopiach.
export function endpointKey(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32)
}

// Klucze VAPID ze zmiennych środowiskowych. Czytane przy wywołaniu, nie przy
// imporcie modułu — wtedy testy i środowiska ustawiające je później widzą
// aktualne wartości.
export function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || null
  return {
    publicKey, privateKey, subject,
    configured: !!(publicKey && privateKey),
    subjectOrDefault: subject || 'mailto:admin@example.com',
  }
}

export function pushProvider(endpoint = '') {
  return endpoint.includes('apple.com') ? 'apple'
    : endpoint.includes('fcm.googleapis.com') ? 'fcm'
    : endpoint.includes('mozilla.com') ? 'mozilla'
    : 'other'
}

// 404/410 od serwisu push = subskrypcja nie istnieje (odinstalowana aplikacja,
// cofnięta zgoda). Inne błędy bywają przejściowe.
export function isExpiredPush(err) {
  const status = err?.statusCode || 0
  return status === 410 || status === 404
}

// Kasuje subskrypcję razem z jej mapą cooldownu — obie są kluczowane tym samym
// hashem endpointu, a sama subskrypcja zostawiała osierocony blob.
export async function removeSubscription(key) {
  await getStore('push-subscriptions').delete(key).catch(() => {})
  await getStore('push-alerted').delete(key).catch(() => {})
}

// Mapa cooldownu (klucz → chwila ostatniego alertu) bez wpisów starszych niż `ttlMs`.
export function pruneCooldown(map, ttlMs, now) {
  const out = {}
  for (const [k, ts] of Object.entries(map || {})) if (now - ts <= ttlMs) out[k] = ts
  return out
}
