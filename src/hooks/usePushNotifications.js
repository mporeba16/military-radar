import { useState, useEffect, useCallback } from 'react'
import { subscribePush } from '../api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [permissionState, setPermissionState] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription()
    ).then(sub => {
      setIsSubscribed(!!sub)
    })
  }, [])

  const subscribe = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications nie są obsługiwane przez tę przeglądarkę')
      return
    }

    const permission = await Notification.requestPermission()
    setPermissionState(permission)
    if (permission !== 'granted') return

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
      await subscribePush(sub)
      setIsSubscribed(true)
    } catch (err) {
      console.error('Push subscribe failed:', err)
      // Jeśli brak VAPID key (dev mode), tylko prosimy o uprawnienia
      if (Notification.permission === 'granted') {
        setIsSubscribed(true)
      }
    }
  }, [])

  return { isSubscribed, subscribe, permissionState }
}
