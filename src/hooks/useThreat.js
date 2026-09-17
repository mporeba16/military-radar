import { useEffect, useState } from 'react'
import { fetchThreat } from '../api'

// Serwer trzyma policzony stan w Blobs przez minutę, więc częstsze pytanie i
// tak zwróciłoby to samo. Pierwsze wywołanie leci od razu po montażu.
const POLL_INTERVAL_MS = 60_000

export function useThreat() {
  const [threat, setThreat] = useState(null)
  const [threatError, setThreatError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()

    const load = async () => {
      try {
        const data = await fetchThreat(ctrl.signal)
        if (cancelled) return
        setThreat(data)
        setThreatError(null)
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return
        // Zostawiamy ostatnią znaną ocenę na mapie — znika dopiero przy
        // przeładowaniu. Lepiej minutę nieświeżych danych niż pusta plakietka.
        setThreatError(err.message)
      }
    }

    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => { cancelled = true; ctrl.abort(); clearInterval(id) }
  }, [])

  return { threat, threatError }
}
