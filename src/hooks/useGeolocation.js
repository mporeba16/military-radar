import { useState, useCallback, useEffect, useRef } from 'react'

export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [locationError, setLocationError] = useState(null)
  const watchIdRef = useRef(null)

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolokalizacja niedostępna w tej przeglądarce')
      return
    }
    if (watchIdRef.current != null) return
    setLocationError(null)
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => {
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
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }
    )
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') startWatch()
        result.onchange = () => { if (result.state === 'granted') startWatch() }
      }).catch(() => {})
    }
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [startWatch])

  return { location, locationError, requestLocation: startWatch }
}
