import { useState, useEffect, useCallback, useRef } from 'react'
import { getDeviceId } from '../lib/deviceId'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

// Suwak zasięgu ma 300 pozycji, a watchPosition potrafi sypać fiksami co kilka
// sekund. Bez zwłoki każdy krok suwaka i każdy fix szedł osobnym POST-em, a
// subscribe.js przepuszcza jedno wywołanie na 10 s — reszta wracała z 429 i
// końcowa wartość zasięgu nigdy nie docierała na serwer.
const SYNC_DEBOUNCE_MS = 600

// Około 110 m. Poniżej tej zmiany pozycja nie wpływa na alerty zasięgowe, a
// surowy odczyt z GPS różni się praktycznie przy każdym fiksie.
const COORD_DECIMALS = 3
function roundCoord(v) {
  if (v == null) return null
  const f = 10 ** COORD_DECIMALS
  return Math.round(v * f) / f
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

async function syncToServer(sub, lat, lon, radius, kinds, arrivals) {
  if (!sub) return { ok: false, error: 'no-subscription' }
  try {
    const res = await fetch('/.netlify/functions/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(), lat, lon, radius, kinds, arrivals, deviceId: getDeviceId(),
      }),
    })
    let payload = null
    try { payload = await res.json() } catch {}
    if (!res.ok) {
      const code = payload?.error || `http-${res.status}`
      const detail = payload?.detail ? `: ${payload.detail}` : ''
      // Serwer przepuszcza jeden zapis na 10 s. Odrzucony nie może przepaść —
      // niósł zwykle najświeższą pozycję albo ustawienie.
      const retryAfterMs = res.status === 429 ? Number(payload?.retryAfterMs) || 10_000 : null
      return { ok: false, error: `${code}${detail}`, retryAfterMs }
    }
    return { ok: true, hasGps: payload?.hasGps }
  } catch (err) {
    return { ok: false, error: err.message || 'network' }
  }
}

export function usePushNotifications(location, radius, kinds, arrivals) {
  const [isSubscribed, setIsSubscribed] = useState(false)
  // Czy znamy już stan subskrypcji? Zanim asynchroniczne getSubscription() się
  // rozwiąże, isSubscribed jest false — gdyby klient w tym oknie odpalił lokalne
  // powiadomienie, zdublowałby push z serwera. Ten flag pozwala odpalać fallback
  // dopiero, gdy NA PEWNO wiemy, że użytkownik nie jest zasubskrybowany.
  const [subResolved, setSubResolved] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [permissionState, setPermissionState] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const subRef = useRef(null)
  // Podbicie wymusza ponowny zapis na serwerze: po odrzuceniu 429 i zaraz po
  // włączeniu powiadomień.
  const [syncNonce, setSyncNonce] = useState(0)

  // Pozycja zaokrąglona i kategorie rozłożone na wartości proste — dzięki temu
  // efekt synchronizacji reaguje na realną zmianę, a nie na nową referencję
  // obiektu przy każdym renderze.
  const syncLat = roundCoord(location?.lat)
  const syncLon = roundCoord(location?.lon)
  const wantMil = kinds?.mil !== false
  const wantHeli = kinds?.heli !== false
  const wantHeavy = kinds?.heavy !== false
  const wantRare = kinds?.rare !== false
  // Serializowane, żeby efekt reagował na zmianę wartości, a nie referencji.
  const arrivalsKey = arrivals ? JSON.stringify(arrivals) : ''

  // On mount: restore existing subscription. Re-sync handled by the
  // separate effect below, which reacts to location/radius changes.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // Push nieobsługiwany → serwer i tak nie wyśle, więc lokalny fallback ma
      // działać od razu: traktujemy stan jako rozstrzygnięty (i niesubskrybowany).
      setSubResolved(true)
      return
    }
    let cancelled = false
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => {
        if (cancelled) return
        if (sub) {
          subRef.current = sub
          setIsSubscribed(true)
        }
        setSubResolved(true)
      })
      .catch(() => { if (!cancelled) setSubResolved(true) })
    return () => { cancelled = true }
  }, [])

  // Pozycja, zasięg i filtr kategorii lecą na serwer po ustaniu zmian. Każda
  // kolejna zmiana kasuje poprzedni timer, więc przeciągnięcie suwaka przez
  // cały tor kończy się jednym zapytaniem z wartością końcową.
  //
  // Pozycja z GPS przychodzi zwykle kilka sekund po zapisie przy starcie
  // aplikacji — wcześniej trafiała na limit serwera (jeden zapis na 10 s)
  // i przepadała do następnej zmiany. Teraz po 429 zapis idzie jeszcze raz,
  // gdy limit minie.
  useEffect(() => {
    if (!isSubscribed || !subRef.current) return
    let retryId = null
    let cancelled = false
    const id = setTimeout(() => {
      syncToServer(subRef.current, syncLat, syncLon, radius, {
        mil: wantMil, heli: wantHeli, heavy: wantHeavy, rare: wantRare,
      }, arrivalsKey ? JSON.parse(arrivalsKey) : undefined).then(res => {
        if (cancelled) return
        setSyncError(res.ok ? null : res.error)
        if (res.retryAfterMs) retryId = setTimeout(() => setSyncNonce(n => n + 1), res.retryAfterMs + 250)
      })
    }, SYNC_DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(id); clearTimeout(retryId) }
  }, [isSubscribed, syncLat, syncLon, radius, wantMil, wantHeli, wantHeavy, wantRare, arrivalsKey, syncNonce])

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
      // Zapis na serwerze robi efekt synchronizacji wyżej — z kompletem
      // ustawień. Wcześniej szedł też stąd, bez przełącznika rzadkich maszyn
      // i lotnisk: nowa subskrypcja dostawała przyloty i rzadkie maszyny mimo
      // wyłączenia, a poprawny zapis z efektu odbijał się od limitu 10 s.
      setSyncNonce(n => n + 1)
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
  }, [])

  const unsubscribe = useCallback(async () => {
    const sub = subRef.current
    try {
      if (sub) {
        // Poproś serwer o natychmiastowe skasowanie rekordu (inaczej znika dopiero
        // po 410 z APNS), a potem wypisz się po stronie przeglądarki.
        await fetch('/.netlify/functions/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
    } finally {
      subRef.current = null
      setIsSubscribed(false)
      setSyncError(null)
    }
  }, [])

  return {
    isSubscribed,
    subResolved,
    isSubscribing,
    subscribe,
    unsubscribe,
    permissionState,
    subscribeError,
    syncError,
  }
}
