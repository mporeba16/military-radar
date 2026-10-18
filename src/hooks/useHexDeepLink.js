import { useEffect } from 'react'

const HEX_RE = /^[a-f0-9]{6}$/i

// Zaznaczona maszyna w adresie: #hex=48da46 zaznacza ją przy otwarciu,
// a adres nadąża za zaznaczeniem, więc da się go wysłać albo zapisać.
// Kliknięte powiadomienie przy otwartej aplikacji przychodzi z service
// workera wiadomością (sama zmiana hasha nie odpaliłaby odczytu przy starcie).
// `onOpen(hex)` — wybór spoza mapy: zaznacz i dolecieć do maszyny.
export function useHexDeepLink(selectedHex, onOpen) {
  useEffect(() => {
    const m = window.location.hash.match(/[#?&]hex=([a-f0-9]{6})/i)
    if (m) onOpen(m[1].toLowerCase())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = e => {
      const d = e.data
      if (d?.type === 'select-hex' && HEX_RE.test(d.hex || '')) onOpen(d.hex.toLowerCase())
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [onOpen])

  useEffect(() => {
    if (selectedHex && !selectedHex.startsWith('__')) {
      const desired = `#hex=${selectedHex}`
      if (window.location.hash !== desired) {
        try { window.history.replaceState(null, '', desired) } catch {}
      }
    } else if (window.location.hash.includes('hex=')) {
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search) } catch {}
    }
  }, [selectedHex])
}
