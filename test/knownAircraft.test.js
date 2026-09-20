import { describe, it, expect } from 'vitest'
import { knownAircraft, resolvedType } from '../src/lib/knownAircraft.js'
import { typeLabel } from '../src/lib/typeNames.js'
import { typePhoto } from '../src/lib/typePhotos.js'

describe('knownAircraft', () => {
  it('zna PLF751 jako Mi-17 z PJOS', () => {
    const k = knownAircraft('48DA45')
    expect(k).toMatchObject({ type: 'MI17', unit: 'PJOS' })
    expect(k.unitFull).toContain('Operacji Specjalnych')
  })

  it('nasz typ wygrywa z kodem z ADS-B', () => {
    expect(resolvedType({ hex: '48da45', t: 'MI8' })).toBe('MI17')
    expect(resolvedType({ hex: 'ae0596', t: 'K35R' })).toBe('K35R')
    expect(resolvedType({})).toBe('')
  })

  it('rozpoznany typ dalej ma nazwę i zdjęcie poglądowe', () => {
    const t = resolvedType({ hex: '48da45', t: 'MI8' })
    expect(typeLabel(t)).toBe('Mi-17')
    expect(typePhoto(t)).not.toBeNull()
  })

  it('nie zmyśla dla nieznanych maszyn', () => {
    expect(knownAircraft('abcdef')).toBeNull()
    expect(knownAircraft(null)).toBeNull()
  })
})
