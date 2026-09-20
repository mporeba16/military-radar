import { useEffect, useState } from 'react'

// Lot zza oceanu trwa godzinami, a serwer i tak trzyma wynik trzy minuty —
// częściej nie ma po co pytać.
const REFRESH_MS = 3 * 60 * 1000

// Jumbo jety i An-124 lecące do Rzeszowa albo Krakowa. Pobierane tylko wtedy,
// gdy włączony jest choć jeden z dwóch przełączników w ustawieniach.
export function useInbound(enabled) {
  const [inbound, setInbound] = useState([])

  useEffect(() => {
    if (!enabled) { setInbound([]); return }
    let ctrl = null
    const load = async () => {
      ctrl?.abort()
      ctrl = new AbortController()
      try {
        const r = await fetch('/.netlify/functions/inbound', { signal: ctrl.signal })
        if (!r.ok) return
        const data = await r.json()
        setInbound(Array.isArray(data.inbound) ? data.inbound : [])
      } catch { /* brak danych zostawia poprzednie */ }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { ctrl?.abort(); clearInterval(id) }
  }, [enabled])

  return inbound
}
