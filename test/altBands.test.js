import { describe, it, expect } from 'vitest'
import { ALT_BANDS, ALL_BANDS_ON, bandForAltM, normalizeBands } from '../src/lib/altBands.js'

describe('bandForAltM', () => {
  it('przypisuje wysokość do pasma', () => {
    expect(bandForAltM(0)).toBe('a0')
    expect(bandForAltM(2999)).toBe('a0')
    expect(bandForAltM(3000)).toBe('a3')
    expect(bandForAltM(8500)).toBe('a6')
    expect(bandForAltM(11999)).toBe('a9')
    expect(bandForAltM(12000)).toBe('a12')
    expect(bandForAltM(30000)).toBe('a12')
  })

  it('brak odczytu wysokości nie należy do żadnego pasma', () => {
    expect(bandForAltM(null)).toBe(null)
    expect(bandForAltM(undefined)).toBe(null)
    expect(bandForAltM(NaN)).toBe(null)
  })

  it('wysokość ujemna nie trafia do pasma przyziemnego', () => {
    expect(bandForAltM(-50)).toBe(null)
  })
})

describe('normalizeBands', () => {
  it('brak zapisu oznacza wszystkie pasma włączone', () => {
    expect(normalizeBands(undefined)).toEqual(ALL_BANDS_ON)
    expect(normalizeBands(null)).toEqual(ALL_BANDS_ON)
  })

  it('wyłącza wyłącznie jawne false', () => {
    expect(normalizeBands({ a9: false })).toEqual({ ...ALL_BANDS_ON, a9: false })
  })

  it('brakujące pasmo wraca jako włączone', () => {
    const out = normalizeBands({ a0: false })
    expect(out.a0).toBe(false)
    expect(out.a12).toBe(true)
    expect(Object.keys(out)).toHaveLength(ALT_BANDS.length)
  })

  it('nieznane klucze giną', () => {
    expect(normalizeBands({ zzz: false })).toEqual(ALL_BANDS_ON)
  })
})
