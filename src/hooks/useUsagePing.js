import { useEffect, useState } from 'react'
import { getDeviceId } from '../lib/deviceId'

// Anonimowy sygnał „to urządzenie otworzyło dziś aplikację" — raz na dobę
// (czas polski), do licznika użytkowników (netlify/functions/usage.js).
// Czeka, aż wiadomo, czy push jest włączony, żeby podział na „z powiadomieniami"
// był prawdziwy.

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' })
const SENT_KEY = 'radar.usageDay'

export function detectPlatform(ua = navigator.userAgent, touch = navigator.maxTouchPoints || 0) {
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// Gdy stanu pusha nie da się ustalić (service worker się nie zarejestrował —
// navigator.serviceWorker.ready wtedy nigdy się nie rozwiązuje), sygnał idzie
// i tak, po tym czasie, z push = false. Inaczej takie urządzenie w ogóle by
// się nie liczyło.
const READY_TIMEOUT_MS = 5000

export function useUsagePing(subResolved, pushOn) {
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (subResolved) return
    const id = setTimeout(() => setTimedOut(true), READY_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [subResolved])
  const ready = subResolved || timedOut

  useEffect(() => {
    if (!ready) return
    const today = dayFmt.format(Date.now())
    try { if (localStorage.getItem(SENT_KEY) === today) return } catch { /* bez pamięci — wyślemy */ }
    const id = getDeviceId()
    if (!id) return
    fetch('/.netlify/functions/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, standalone: isStandalone(), push: !!pushOn, platform: detectPlatform() }),
      keepalive: true,
    }).then(res => {
      if (res.ok) try { localStorage.setItem(SENT_KEY, today) } catch { /* trudno */ }
    }).catch(() => { /* następnym razem */ })
  }, [ready, pushOn])
}
