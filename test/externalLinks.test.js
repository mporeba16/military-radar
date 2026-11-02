import { describe, it, expect } from 'vitest'
import { fr24Url } from '../src/lib/externalLinks.js'

describe('fr24Url', () => {
  it('lot po znaku wywoławczym', () => {
    expect(fr24Url({ hex: '3f4e27', flight: 'GAF636 ' })).toBe('https://www.flightradar24.com/GAF636')
  })

  it('bez znaku (albo gdy znak to sam adres hex) — brak przycisku', () => {
    expect(fr24Url({ hex: '3f4e27', flight: '' })).toBeNull()
    expect(fr24Url({ hex: '3f4e27', flight: '3f4e27' })).toBeNull()
  })

  it('znak ze spacją albo innymi znakami nie trafia do adresu', () => {
    expect(fr24Url({ hex: 'ae1234', flight: 'RCH 123' })).toBeNull()
  })
})
