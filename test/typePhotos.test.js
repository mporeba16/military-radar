import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { typePhoto, isSameAirframe } from '../src/lib/typePhotos.js'

describe('typePhoto', () => {
  it('daje zdjęcie poglądowe dla rodziny Mi-8/Mi-17', () => {
    const p = typePhoto('MI8')
    expect(p).toMatchObject({ author: 'Alf van Beem', license: 'domena publiczna' })
    expect(typePhoto('mi17')?.src).toBe(p.src)
  })

  it('ma litewskiego L-410 — planespotters pod „02 BLUE” trzyma cudzego An-26', () => {
    const p = typePhoto('L410')
    expect(p).toMatchObject({ author: 'Anna Zvereva', license: 'CC BY-SA 2.0', hex: '503fd9' })
  })

  it('rozróżnia zdjęcie TEJ maszyny od zdjęcia poglądowego', () => {
    // LF345 to dokładnie ten egzemplarz; podpis „poglądowe” byłby nieprawdą.
    expect(isSameAirframe(typePhoto('L410'), '503fd9')).toBe(true)
    expect(isSameAirframe(typePhoto('L410'), 'ABCDEF')).toBe(false)
    // Mi-17 nie ma przypisanego egzemplarza — zostaje „poglądowe”.
    expect(isSameAirframe(typePhoto('MI8'), '48da45')).toBe(false)
  })

  it('nie zmyśla dla typów, których nie mamy', () => {
    expect(typePhoto('F16')).toBeNull()
    expect(typePhoto('')).toBeNull()
  })

  it('każdy wpis ma plik na dysku, autora, licencję i źródło', () => {
    for (const t of ['MI8', 'L410']) {
      const p = typePhoto(t)
      expect(p.author && p.license && p.source).toBeTruthy()
      // Plik musi istnieć — inaczej karta pokazałaby pustą ramkę.
      expect(readFileSync(new URL(`../public${p.src}`, import.meta.url)).length).toBeGreaterThan(1000)
    }
  })
})
