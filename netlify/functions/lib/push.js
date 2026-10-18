// Drobiazgi wspólne dla wysyłki push (notify) i diagnostyki (status).
import { getStore } from '@netlify/blobs'

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
