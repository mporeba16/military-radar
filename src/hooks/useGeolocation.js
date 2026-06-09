import { useState, useCallback, useEffect, useRef } from 'react'

const GEO_OPTS = { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }
const RETRY_DELAY_MS = 3000
const MAX_RETRIES = 6  // ~18 s cichego ponawiania, zanim pokażemy twardy błąd

export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [locationError, setLocationError] = useState(null)
  const watchIdRef = useRef(null)
  const retryTimerRef = useRef(null)
  const attemptsRef = useRef(0)
  // Czy mieliśmy KIEDYKOLWIEK poprawny fix — gdy tak, przejściowe błędy
  // (kCLErrorLocationUnknown) ignorujemy i zostaje ostatnia znana pozycja.
  const hasFixRef = useRef(false)

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolokalizacja niedostępna w tej przeglądarce')
      return
    }
    setLocationError(null)
    attemptsRef.current = 0

    // Ubij poprzedni watch i zaplanowane ponowienie — KLUCZOWE dla „spróbuj
    // ponownie": watchPosition zwraca id także gdy chwilę później odpala błąd,
    // więc bez czyszczenia martwy watch blokowałby kolejne próby.
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    const onOk = pos => {
      hasFixRef.current = true
      attemptsRef.current = 0
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
      setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      setAccuracy(pos.coords.accuracy ?? null)
      setLocationError(null)  // clear any stale error on success
    }

    const onDenied = () => {
      hasFixRef.current = false
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
      setLocationError('Brak zgody na lokalizację')
    }

    // Błąd watcha: tylko odmowa zgody jest twarda. Błędy przejściowe
    // (POSITION_UNAVAILABLE / timeout) ignorujemy — watch sam próbuje dalej, a
    // ponawianiem i komunikatem zarządza pętla getCurrentPosition poniżej.
    const onErrWatch = err => {
      if (err.code === err.PERMISSION_DENIED) onDenied()
    }

    // Błąd pojedynczego strzału: napędza ponawianie i cap prób.
    const onErrPoll = err => {
      if (err.code === err.PERMISSION_DENIED) { onDenied(); return }
      // POSITION_UNAVAILABLE = kCLErrorLocationUnknown (Safari/CoreLocation) —
      // niemal zawsze przejściowy: system nie ma fixa teraz, ale dostanie go za
      // chwilę. Jeśli mamy już pozycję → ignorujemy. Jeśli nie → zostajemy w
      // stanie „szukam…" (locationError null, BEZ czerwonego alarmu) i ponawiamy
      // co RETRY_DELAY_MS. Dopiero po MAX_RETRIES pokazujemy twardy błąd.
      if (hasFixRef.current) return
      attemptsRef.current += 1
      if (attemptsRef.current >= MAX_RETRIES) {
        setLocationError(err.code === err.POSITION_UNAVAILABLE ? 'Lokalizacja niedostępna' : 'Błąd geolokalizacji')
        return
      }
      if (!retryTimerRef.current) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null
          navigator.geolocation.getCurrentPosition(onOk, onErrPoll, { ...GEO_OPTS, maximumAge: 0, timeout: 20000 })
        }, RETRY_DELAY_MS)
      }
    }

    // Natychmiastowy strzał (szybka odpowiedź) + ciągły watch (utrzymuje pozycję).
    navigator.geolocation.getCurrentPosition(onOk, onErrPoll, GEO_OPTS)
    watchIdRef.current = navigator.geolocation.watchPosition(onOk, onErrWatch, GEO_OPTS)
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') startWatch()
        if (result.state === 'denied') setLocationError('Brak zgody na lokalizację')
        result.onchange = () => {
          if (result.state === 'granted') startWatch()
          else if (result.state === 'denied') setLocationError('Brak zgody na lokalizację')
        }
      }).catch(() => {})
    }
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [startWatch])

  return { location, accuracy, locationError, requestLocation: startWatch }
}
