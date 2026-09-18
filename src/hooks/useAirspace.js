import { useEffect, useState } from 'react'

// Plan PAŻP zmienia się kilka razy na dobę, a funkcja serwera i tak trzyma go
// 10 minut — częściej nie ma po co pytać.
const REFRESH_MS = 10 * 60 * 1000
// Strefa włącza się i gaśnie o pełnych godzinach i półgodzinach, więc „teraz”
// wystarczy przeliczać co minutę.
const TICK_MS = 60 * 1000

// Strefy z AUP/UUP i bieżący czas. Pobiera tylko przy włączonej warstwie;
// błąd nie czyści ostatnich danych — lepiej pokazać plan sprzed 10 minut niż
// nic, a panel dostaje flagę do komunikatu.
export function useAirspace(enabled) {
  const [zones, setZones] = useState(null)
  const [error, setError] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    let ctrl = null
    const load = async () => {
      ctrl?.abort()
      ctrl = new AbortController()
      try {
        const r = await fetch('/.netlify/functions/airspace', { signal: ctrl.signal })
        if (!r.ok) throw new Error(`http-${r.status}`)
        const data = await r.json()
        setZones(Array.isArray(data.zones) ? data.zones : [])
        setError(false)
      } catch (err) {
        if (err.name !== 'AbortError') setError(true)
      }
    }
    load()
    const refresh = setInterval(load, REFRESH_MS)
    const tick = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => { ctrl?.abort(); clearInterval(refresh); clearInterval(tick) }
  }, [enabled])

  return { zones, error, now }
}
