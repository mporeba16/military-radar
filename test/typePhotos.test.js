import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { typePhoto } from '../src/lib/typePhotos.js'

describe('typePhoto', () => {
  it('daje zdjęcie poglądowe dla rodziny Mi-8/Mi-17', () => {
    const p = typePhoto('MI8')
    expect(p).toMatchObject({ author: 'Alf van Beem', license: 'domena publiczna' })
    expect(typePhoto('mi17')?.src).toBe(p.src)
  })

  it('nie zmyśla dla typów, których nie mamy', () => {
    expect(typePhoto('F16')).toBeNull()
    expect(typePhoto('')).toBeNull()
  })

  it('każdy wpis ma plik na dysku, autora, licencję i źródło', () => {
    for (const t of ['MI8']) {
      const p = typePhoto(t)
      expect(p.author && p.license && p.source).toBeTruthy()
      // Plik musi istnieć — inaczej karta pokazałaby pustą ramkę.
      expect(readFileSync(new URL(`../public${p.src}`, import.meta.url)).length).toBeGreaterThan(1000)
    }
  })
})
