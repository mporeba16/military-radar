import { useEffect, useState } from 'react'

// NOTAM-y wojskowe i zamknięcia lotnisk do „Planu dnia". Serwer trzyma je
// 15 minut, więc pytamy tylko przy otwartym panelu. Błąd (np. brak dostępu do
// autorouter) po prostu chowa sekcję — plan PAŻP działa bez niej.
const REFRESH_MS = 15 * 60 * 1000

export function useNotams(enabled) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let ctrl = null
    const load = async () => {
      ctrl?.abort()
      ctrl = new AbortController()
      try {
        const r = await fetch('/.netlify/functions/notams', { signal: ctrl.signal })
        if (!r.ok) return
        setData(await r.json())
      } catch { /* sekcja NOTAM jest dodatkiem */ }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { ctrl?.abort(); clearInterval(id) }
  }, [enabled])
  return data
}
