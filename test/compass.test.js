import { describe, it, expect } from 'vitest'
import { headingFromEvent, smoothAngle } from '../src/hooks/useCompass.js'

describe('kierunek telefonu', () => {
  it('iOS: gotowy kurs kompasowy', () => {
    expect(headingFromEvent({ webkitCompassHeading: 75, alpha: 10 })).toBe(75)
  })

  it('Android: alpha względem północy rośnie w lewo — kurs to 360 − alpha', () => {
    expect(headingFromEvent({ type: 'deviceorientationabsolute', alpha: 90, absolute: true })).toBe(270)
    expect(headingFromEvent({ type: 'deviceorientation', alpha: 0, absolute: true })).toBe(0)
  })

  it('obrót bez odniesienia do północy (zwykłe deviceorientation) — nic', () => {
    expect(headingFromEvent({ type: 'deviceorientation', alpha: 90, absolute: false })).toBeNull()
  })

  it('telefon poziomo — kurs ekranu przesunięty o kąt obrotu ekranu', () => {
    expect(headingFromEvent({ webkitCompassHeading: 350 }, 90)).toBe(80)
  })

  it('wygładzanie po najkrótszym łuku przez północ, nie przez południe', () => {
    const v = smoothAngle(350, 10, 0.5)
    expect(v).toBe(0)
    expect(smoothAngle(null, 123)).toBe(123)
  })
})
