import { describe, it, expect } from 'vitest'
import { extrapolate, mergeHeavies, inBox, carryForward, EUROPE_BOX, HEAVY_TYPES } from '../netlify/functions/lib/heavyEurope.js'

// Jumbo jety pojawiały się dopiero przy granicy z Niemcami i Czechami, bo
// zapytanie geo adsb.fi sięga tylko 250 nm od środka Polski. Resztę Europy
// daje migawka z adsb.lol (po typie), doklejana w `aircraft`.
const map = (a) => ({ hex: String(a.hex).toLowerCase(), lat: a.lat, lon: a.lon, t: a.t, kind: a._kind })
const BOX = { lamin: 30, lomin: -15, lamax: 72, lomax: 50 }
const NOW = 1_000_000_000

describe('mergeHeavies', () => {
  const overFrance = { hex: '4B1812', t: 'B748', lat: 48.8, lon: 2.3, gs: 0, track: 90, seen_pos: 1 }

  it('dokleja jumbo jeta nad Francją jako „heavy”', () => {
    const out = mergeHeavies([], { at: NOW - 30_000, aircraft: [overFrance] }, BOX, map, NOW)
    expect(out).toEqual([{ hex: '4b1812', lat: 48.8, lon: 2.3, t: 'B748', kind: 'heavy' }])
  })

  it('nie dubluje maszyny, którą mamy już na żywo (nad Polską świeższe dane z adsb.fi)', () => {
    const live = [{ hex: '4b1812', lat: 52, lon: 19, kind: 'heavy' }]
    expect(mergeHeavies(live, { at: NOW, aircraft: [overFrance] }, BOX, map, NOW)).toBe(live)
  })

  it('pomija migawkę starszą niż 5 minut', () => {
    expect(mergeHeavies([], { at: NOW - 6 * 60_000, aircraft: [overFrance] }, BOX, map, NOW)).toEqual([])
  })

  it('pomija maszyny poza obszarem zapytania', () => {
    const overUSA = { ...overFrance, hex: 'a1b2c3', lat: 40.6, lon: -73.8 }
    expect(mergeHeavies([], { at: NOW, aircraft: [overUSA] }, BOX, map, NOW)).toEqual([])
  })

  it('bez migawki zwraca listę bez zmian', () => {
    const live = [{ hex: 'abc123' }]
    expect(mergeHeavies(live, null, BOX, map, NOW)).toBe(live)
  })
})

describe('extrapolate', () => {
  it('przesuwa pozycję wg prędkości i kursu (480 kt na wschód przez 60 s ≈ 8 nm)', () => {
    const a = extrapolate({ lat: 50, lon: 10, gs: 480, track: 90 }, 60)
    expect(a.lat).toBeCloseTo(50, 5)
    // 8 nm na wschód na 50°N = 8 / (60 · cos 50°) ≈ 0.2075°
    expect(a.lon - 10).toBeCloseTo(0.2075, 3)
  })

  it('nie przesuwa dalej niż o 3 minuty i nie rusza maszyn na ziemi', () => {
    const far = extrapolate({ lat: 50, lon: 10, gs: 480, track: 0 }, 3600)
    expect(far.lat - 50).toBeCloseTo((480 * 180) / 3600 / 60, 5)
    const ground = { lat: 50, lon: 10, gs: 10, track: 0, alt_baro: 'ground' }
    expect(extrapolate(ground, 60)).toBe(ground)
  })
})

describe('konfiguracja', () => {
  it('obszar obejmuje Francję, a typy to An-124 i 747-8/-400', () => {
    expect(inBox({ lat: 48.8, lon: 2.3 }, EUROPE_BOX)).toBe(true)
    expect(HEAVY_TYPES).toEqual(['A124', 'B748', 'B744'])
  })
})

describe('przenoszenie z poprzedniej migawki (429 adsb.lol)', () => {
  it('An-124 pytany pierwszy, najwyżej 3 typy na przebieg', () => {
    expect(HEAVY_TYPES[0]).toBe('A124')
    expect(HEAVY_TYPES.length).toBeLessThanOrEqual(3)
  })

  it('przenosi maszynę typu, którego teraz nie udało się pobrać', () => {
    const prev = { at: NOW - 60_000, aircraft: [{ hex: 'aaa111', t: 'B744', _at: NOW - 60_000 }] }
    const out = carryForward([], ['A124', 'B748'], prev, NOW)
    expect(out.map(a => a.hex)).toEqual(['aaa111'])
  })

  it('nie przenosi typu właśnie pobranego (zniknął — wylądował) ani zbyt starego', () => {
    const prev = { at: NOW - 60_000, aircraft: [{ hex: 'bbb222', t: 'B748', _at: NOW - 60_000 }, { hex: 'ccc333', t: 'B744', _at: NOW - 4 * 60_000 }] }
    expect(carryForward([], ['A124', 'B748'], prev, NOW)).toEqual([])
  })

  it('wiek pozycji liczony od pobrania rekordu (_at), nie od migawki', () => {
    const old = { hex: 'ddd444', t: 'B744', lat: 48, lon: 2, _at: NOW - 6 * 60_000 }
    expect(mergeHeavies([], { at: NOW, aircraft: [old] }, BOX, map, NOW)).toEqual([])
  })
})
