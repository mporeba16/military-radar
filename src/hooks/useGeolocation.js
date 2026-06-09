import { useState, useCallback, useEffect, useRef } from 'react'

export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [locationError, setLocationError] = useState(null)
  const watchIdRef = useRef(null)

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolokalizacja niedostępna w tej przeglądarce')
      return
    }
    setLocationError(null)

    // Ubijamy ewentualny poprzedni watch i startujemy świeży. KLUCZOWE dla
    // „spróbuj ponownie": watchPosition zwraca id także gdy chwilę później
    // odpala callback błędu (POSITION_UNAVAILABLE/timeout) — wcześniejszy guard
    // `if (watchIdRef.current != null) return` blokował wtedy ponowienie na
    // zawsze (martwy watch z ustawionym id). Teraz każdy retry naprawdę ponawia.
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    const onOk = pos => {
      setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      setAccuracy(pos.coords.accuracy ?? null)
      setLocationError(null)  // clear any stale error on first success
    }
    const onErr = err => {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          setLocationError('Brak zgody na lokalizację')
          break
        case err.POSITION_UNAVAILABLE:
          setLocationError('Lokalizacja niedostępna')
          break
        default:
          setLocationError('Błąd geolokalizacji')
      }
    }
    const opts = { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }

    // Natychmiastowy strzał o pozycję — szybka odpowiedź zamiast czekania na
    // pierwszy tick watcha (i błąd nie zostawia martwego id).
    navigator.geolocation.getCurrentPosition(onOk, onErr, opts)
    watchIdRef.current = navigator.geolocation.watchPosition(onOk, onErr, opts)
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
    }
  }, [startWatch])

  return { location, accuracy, locationError, requestLocation: startWatch }
}
