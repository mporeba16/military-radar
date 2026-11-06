import { useCallback, useEffect, useRef, useState } from 'react'

// Kierunek, w który zwrócony jest telefon (0° = północ, zgodnie z ruchem
// wskazówek zegara) — do stożka „tam patrzysz" przy niebieskiej kropce na
// mapie, jak w Google Maps. Dzięki niemu wiadomo, w którą stronę się obrócić,
// żeby zobaczyć samolot.
//
// Źródła:
//   - iOS: `webkitCompassHeading` z `deviceorientation` — gotowy kurs
//     kompasowy; wymaga zgody (DeviceOrientationEvent.requestPermission),
//     o którą wolno poprosić TYLKO w odpowiedzi na dotknięcie (stan
//     'needs-permission', gdy po chwili nie ma odczytów),
//   - Android (Chrome): `deviceorientationabsolute` — `alpha` względem
//     północy, kurs = 360 − alpha.
// Zwykłe `deviceorientation` bez `absolute` mierzy obrót od położenia
// startowego, a nie od północy — takiego nie używamy.
//
// state: 'unsupported' | 'needs-permission' | 'waiting' | 'active' | 'denied'

// Drgania magnetometru: zmiany mniejsze niż tyle nie przerysowują mapy,
// a odczyty są wygładzane (średnia krocząca z zawinięciem 359° → 0°).
const MIN_CHANGE_DEG = 2
const SMOOTHING = 0.25

export function headingFromEvent(e, screenAngle = 0) {
  let h = null
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    h = e.webkitCompassHeading
  } else if ((e.absolute || e.type === 'deviceorientationabsolute') && typeof e.alpha === 'number') {
    h = 360 - e.alpha
  }
  if (h == null) return null
  // Telefon obrócony poziomo — kurs ekranu różni się od kursu urządzenia.
  return ((h + screenAngle) % 360 + 360) % 360
}

// Wygładzanie kąta po najkrótszym łuku (350° i 10° to 20°, nie 340°).
export function smoothAngle(prev, next, k = SMOOTHING) {
  if (prev == null) return next
  const d = ((next - prev + 540) % 360) - 180
  return ((prev + d * k) % 360 + 360) % 360
}

function screenAngle() {
  return (typeof screen !== 'undefined' && screen.orientation?.angle) || window.orientation || 0
}

// Po tylu ms bez odczytu uznajemy, że kompas czeka na zgodę (iOS). Sama
// obecność requestPermission tego nie mówi — nowy Chrome też ją ma, a odczyty
// daje bez pytania.
const PERMISSION_GRACE_MS = 1500

// Plakietka „dotknij, aby włączyć kompas" ma sens tylko na urządzeniu
// dotykowym — komputer kompasu nie ma.
const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export function useCompass() {
  const canAsk = typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  const [state, setState] = useState(supported ? 'waiting' : 'unsupported')
  const [heading, setHeading] = useState(null)
  const smoothRef = useRef(null)
  const shownRef = useRef(null)
  // Po jednej prośbie o zgodę plakietka już nie wraca — urządzenie dotykowe
  // bez kompasu (np. tablet) dostałoby ją z powrotem po każdym 1,5 s ciszy.
  const askedRef = useRef(false)

  // Brak odczytów, a da się poprosić o zgodę → iOS czeka na dotknięcie.
  useEffect(() => {
    if (state !== 'waiting' || !canAsk || askedRef.current || !isTouch()) return
    const id = setTimeout(() => setState(s => (s === 'waiting' ? 'needs-permission' : s)), PERMISSION_GRACE_MS)
    return () => clearTimeout(id)
  }, [state, canAsk])

  // Nasłuch także przy 'needs-permission' — gdyby odczyty jednak przyszły,
  // plakietka sama znika.
  const listening = state !== 'unsupported' && state !== 'denied'
  useEffect(() => {
    if (!listening) return
    const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    let raf = 0
    const onEvent = e => {
      const h = headingFromEvent(e, screenAngle())
      if (h == null) return
      smoothRef.current = smoothAngle(smoothRef.current, h)
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const v = smoothRef.current
        const prev = shownRef.current
        if (prev != null && Math.abs(((v - prev + 540) % 360) - 180) < MIN_CHANGE_DEG) return
        shownRef.current = v
        setHeading(Math.round(v))
        setState('active')
      })
    }
    window.addEventListener(type, onEvent)
    return () => { window.removeEventListener(type, onEvent); if (raf) cancelAnimationFrame(raf) }
  }, [listening])

  // iOS: wywołać z obsługi dotknięcia.
  const request = useCallback(async () => {
    if (!canAsk) return
    askedRef.current = true
    try {
      const res = await DeviceOrientationEvent.requestPermission()
      setState(res === 'granted' ? 'waiting' : 'denied')
    } catch {
      setState('denied')
    }
  }, [canAsk])

  return { heading, state, request }
}
