import { useState, useCallback } from 'react'

export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [locationError, setLocationError] = useState(null)

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolokalizacja niedostępna w tej przeglądarce')
      return
    }
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
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
      { enableHighAccuracy: false, timeout: 10000 }
    )
  }, [])

  return { location, locationError, requestLocation }
}
