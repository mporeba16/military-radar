import { useState, useEffect, useCallback, useRef } from 'react'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

async function syncToServer(sub, lat, lon, radius) {
  if (!sub || lat == null || lon == null) return
  try {
    await fetch('/.netlify/functions/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), lat, lon, radius }),
    })
  } catch {}
}

export function usePushNotifications(location, radius) {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [permissionState, setPermissionState] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const subRef = useRef(null)

  // On mount: restore existing subscription and re-sync position to server
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => {
        if (!sub) return
        subRef.current = sub
        setIsSubscribed(true)
      })
  }, [])

  // Whenever GPS position or radius changes, push updated position to server
  useEffect(() => {
    if (!isSubscribed || !subRef.current || !location) return
    syncToServer(subRef.current, location.lat, location.lon, radius)
  }, [isSubscribed, location?.lat, location?.lon, radius])

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications nie są obsługiwane przez tę przeglądarkę')
      return
    }

    setIsSubscribing(true)
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
      await syncToServer(sub, location?.lat, location?.lon, radius)
    } catch (err) {
      console.error('Push subscribe failed:', err)
      if (Notification.permission === 'granted') setIsSubscribed(true)
    } finally {
      setIsSubscribing(false)
    }
  }, [location, radius])

  return { isSubscribed, isSubscribing, subscribe, permissionState }
}
