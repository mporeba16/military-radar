import { useState, useEffect, useCallback, useRef } from 'react'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// Stabilny identyfikator urządzenia — pozwala serwerowi usunąć stary endpoint
// po rotacji push (inaczej to samo urządzenie dostaje zdublowane powiadomienia).
function getDeviceId() {
  try {
    let id = localStorage.getItem('radar.deviceId')
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      localStorage.setItem('radar.deviceId', id)
    }
    return id
  } catch { return null }
}

async function syncToServer(sub, lat, lon, radius) {
  if (!sub) return { ok: false, error: 'no-subscription' }
  try {
    const res = await fetch('/.netlify/functions/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), lat, lon, radius, deviceId: getDeviceId() }),
    })
    let payload = null
    try { payload = await res.json() } catch {}
    if (!res.ok) {
      const code = payload?.error || `http-${res.status}`
      const detail = payload?.detail ? `: ${payload.detail}` : ''
      return { ok: false, error: `${code}${detail}` }
    }
    return { ok: true, hasGps: payload?.hasGps }
  } catch (err) {
    return { ok: false, error: err.message || 'network' }
  }
}

async function fetchStatus(sub) {
  if (!sub) return null
  try {
    const res = await fetch('/.netlify/functions/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export function usePushNotifications(location, radius) {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [serverStatus, setServerStatus] = useState(null)
  const [permissionState, setPermissionState] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const subRef = useRef(null)

  // On mount: restore existing subscription. Re-sync handled by the
  // separate effect below, which reacts to location/radius changes.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    let cancelled = false
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => {
        if (cancelled || !sub) return
        subRef.current = sub
        setIsSubscribed(true)
      })
    return () => { cancelled = true }
  }, [])

  // Whenever GPS position or radius changes, push updated position to server
  useEffect(() => {
    if (!isSubscribed || !subRef.current) return
    syncToServer(subRef.current, location?.lat, location?.lon, radius).then(res => {
      setSyncError(res.ok ? null : res.error)
    })
  }, [isSubscribed, location?.lat, location?.lon, radius])

  // Periodically refresh server-side status while subscribed
  useEffect(() => {
    if (!isSubscribed || !subRef.current) {
      setServerStatus(null)
      return
    }
    let cancelled = false
    const refresh = async () => {
      const s = await fetchStatus(subRef.current)
      if (!cancelled) setServerStatus(s)
    }
    refresh()
    const id = setInterval(refresh, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [isSubscribed, location?.lat, location?.lon, radius])

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSubscribeError('Przeglądarka nie obsługuje push notifications')
      return
    }
    if (!VAPID_PUBLIC_KEY) {
      setSubscribeError('Brak klucza VAPID (VITE_VAPID_PUBLIC_KEY)')
      return
    }

    setIsSubscribing(true)
    setSubscribeError(null)
    try {
      const permission = await Notification.requestPermission()
      setPermissionState(permission)
      if (permission !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      subRef.current = sub
      setIsSubscribed(true)
      const res = await syncToServer(sub, location?.lat, location?.lon, radius)
      if (!res.ok) setSyncError(res.error)
    } catch (err) {
      console.error('Push subscribe failed:', err)
      if (Notification.permission === 'granted') {
        setIsSubscribed(true)
      } else {
        setSubscribeError('Nie udało się włączyć powiadomień')
      }
    } finally {
      setIsSubscribing(false)
    }
  }, [location, radius])

  const sendTestPush = useCallback(async () => {
    if (!subRef.current) return { ok: false, error: 'no-subscription' }
    try {
      const res = await fetch('/.netlify/functions/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subRef.current.endpoint }),
      })
      let payload = null
      try { payload = await res.json() } catch {}
      if (!res.ok) {
        const code = payload?.error || `http-${res.status}`
        const detail = payload?.detail ? `: ${payload.detail}` : ''
        return { ok: false, error: `${code}${detail}` }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message || 'network' }
    }
  }, [])

  return {
    isSubscribed,
    isSubscribing,
    subscribe,
    sendTestPush,
    permissionState,
    subscribeError,
    syncError,
    serverStatus,
  }
}
