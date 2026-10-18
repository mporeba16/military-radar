import { useEffect, useRef } from 'react'

// Odpytywanie, które staje razem z kartą przeglądarki i wraca od razu po
// powrocie do niej.
//
// Wcześniejsza wersja miała flagę `booted`, która chroniła odroczony
// pierwszy strzał przed podwójnym uruchomieniem — ale blokowała też
// natychmiastowe odświeżenie po powrocie do karty. Użytkownik iOS PWA
// wracający po minucie widział nieaktualne pozycje do skutku.
//
// Teraz odroczony (requestIdleCallback) jest tylko pierwszy start; każde
// wznowienie odświeża od razu. `fn` może się zmieniać między renderami —
// interwał zawsze woła najnowszą wersję.
export function usePolling(fn, intervalMs) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let id = null
    let firstBoot = true
    const tick = () => fnRef.current()
    const start = () => {
      if (id != null) return
      const begin = () => {
        tick()
        id = setInterval(tick, intervalMs)
      }
      if (firstBoot) {
        firstBoot = false
        if (typeof requestIdleCallback === 'function') requestIdleCallback(begin, { timeout: 1500 })
        else setTimeout(begin, 0)
      } else {
        begin()
      }
    }
    const stop = () => {
      if (id != null) { clearInterval(id); id = null }
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    onVis()
    document.addEventListener('visibilitychange', onVis)
    // iOS Safari przy wznowieniu PWA bywa, że wysyła tylko `pageshow`
    // (bez visibilitychange) — słuchamy obu.
    window.addEventListener('pageshow', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onVis)
      window.removeEventListener('focus', onVis)
      stop()
    }
  }, [intervalMs])
}
