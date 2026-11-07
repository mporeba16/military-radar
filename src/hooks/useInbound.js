import { useEffect, useState } from 'react'

// Lot zza oceanu trwa godzinami, a serwer i tak trzyma wynik trzy minuty —
// częściej nie ma po co pytać.
const REFRESH_MS = 3 * 60 * 1000

// Jumbo jety i An-124 lecące do Rzeszowa albo Krakowa (`inbound`) i ostatnie
// lądowania tam (`landed`, do panelu Przyloty). Pobierane tylko wtedy, gdy
// włączony jest choć jeden dzwonek lotniska albo otwarty jest panel.
const EMPTY = { inbound: [], landed: [] }
export function useInbound(enabled) {
  const [data, setData] = useState(EMPTY)

  useEffect(() => {
    if (!enabled) { setData(EMPTY); return }
    let ctrl = null
    const load = async () => {
      ctrl?.abort()
      ctrl = new AbortController()
      try {
        const r = await fetch('/.netlify/functions/inbound', { signal: ctrl.signal })
        if (!r.ok) return
        const body = await r.json()
        setData({
          inbound: Array.isArray(body.inbound) ? body.inbound : [],
          landed: Array.isArray(body.landed) ? body.landed : [],
        })
      } catch { /* brak danych zostawia poprzednie */ }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { ctrl?.abort(); clearInterval(id) }
  }, [enabled])

  return data
}
