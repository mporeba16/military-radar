// Sygnały o maszynie w zasięgu przy otwartej aplikacji: dźwięk, lokalne
// powiadomienie systemowe (gdy push z serwera nie jest włączony) i pamięć
// odrzuconych komunikatów między sesjami.

import { alertText } from './notifyText'
import { t } from '../i18n'

export function loadDismissed() {
  try {
    const raw = localStorage.getItem('radar.dismissed')
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
// Keep at most this many dismissed hexes in localStorage — Set preserves
// insertion order, so we trim to the most-recent N to bound storage growth
// across long-running sessions.
const DISMISSED_LIST_CAP = 100

export function persistDismissed(set) {
  try {
    const arr = [...set].filter(h => !h.startsWith('__')).slice(-DISMISSED_LIST_CAP)
    localStorage.setItem('radar.dismissed', JSON.stringify(arr))
  } catch {}
}

// Singleton AudioContext — browsers limit how many can be open. Reuse one
// across all alerts; create a new oscillator each ping. After long suspends
// some browsers move the ctx to `closed`, in which case we lazily replace it.
let alertCtx = null
export function playAlertSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!alertCtx || alertCtx.state === 'closed') alertCtx = new AC()
    if (alertCtx.state === 'suspended') alertCtx.resume().catch(() => {})
    const osc = alertCtx.createOscillator()
    const gain = alertCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, alertCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, alertCtx.currentTime + 0.35)
    osc.connect(gain).connect(alertCtx.destination)
    osc.start()
    osc.stop(alertCtx.currentTime + 0.4)
  } catch {}
}

export function triggerNotification(ac, dist) {
  if (!('serviceWorker' in navigator)) return
  if (Notification.permission !== 'granted') {
    console.debug('[notify] skipped: permission =', Notification.permission)
    return
  }
  // Ta sama funkcja składa treść, co push z serwera — inaczej to samo zdarzenie
  // brzmiałoby inaczej w zależności od tego, czy aplikacja jest otwarta.
  const { title, body } = alertText(ac, dist)

  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // Per-hex tag + renotify=true: if the same aircraft re-enters the
      // radar, iOS shows a new notification instead of silently replacing
      // the old (and missed) one. Tag MUSI być spójny z serwerowym push
      // (push-handler.js → data.tag = ac.hex), żeby ewentualny dublet
      // klient+serwer został przez iOS scalony, a nie pokazany dwa razy.
      tag: ac.hex,
      renotify: true,
      data: { hex: ac.hex },
      actions: [{ action: 'show', title: t('NOTIF_SHOW') }],
    })
  })
}
