import { describe, it, expect } from 'vitest'
import { knownAircraft, resolvedType, applyKnown } from '../src/lib/knownAircraft.js'
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

  it('zna PLF252 jako polskiego Herculesa', () => {
    // Ta maszyna nadaje bez pola typu — bez wpisu zostawała bezimienna
    // na mapie i w powiadomieniu.
    expect(knownAircraft('48d8ef')).toMatchObject({ type: 'C130' })
    expect(typeLabel(resolvedType({ hex: '48d8ef', t: '' }))).toBe('C130 · Hercules')
  })

  it('applyKnown uzupełnia pusty typ, ale nie nadpisuje danych z ADS-B', () => {
    // Gdyby adsb.fi kiedyś zaczęło podawać typ tej maszyny, ich dane wygrywają
    // — nasza tabela jest łatką na brak, nie nadrzędnym źródłem prawdy.
    expect(applyKnown({ hex: '48d8ef', t: '', flight: 'PLF252' }).t).toBe('C130')
    expect(applyKnown({ hex: '48d8ef', t: 'C30J' }).t).toBe('C30J')
    // Rekord nieznanej maszyny wraca bez zmian (ten sam obiekt).
    const obcy = { hex: 'abcdef', t: '' }
    expect(applyKnown(obcy)).toBe(obcy)
  })

  it('nie zmyśla dla nieznanych maszyn', () => {
    expect(knownAircraft('abcdef')).toBeNull()
    expect(knownAircraft(null)).toBeNull()
  })
})

describe('Eurofightery Luftwaffe bez typu w ADS-B', async () => {
  const { applyKnown } = await import('../src/lib/knownAircraft.js')
  const { getCommonName } = await import('../src/lib/typeNames.js')
  const { getShapeKey } = await import('../src/components/aircraftShapes.js')
  it('GAFS73E (3f65e3) dostaje typ EUFI, sylwetkę Typhoona i nazwę', () => {
    const ac = applyKnown({ hex: '3f65e3', flight: 'GAFS73E', t: '' })
    expect(ac.t).toBe('EUFI')
    expect(getShapeKey(ac.t, 480)).toBe('typhoon')
    expect(getCommonName(ac.t)).toBe('Typhoon')
  })
  it('nowy egzemplarz z serii GAFS73 (nieznany hex) też jest Eurofighterem', async () => {
    const { rareRoleFor } = await import('../src/lib/rareTypes.js')
    const ac = applyKnown({ hex: '3fffff', flight: 'GAFS73Z ', t: '' })
    expect(ac.t).toBe('EUFI')
    expect(resolvedType({ hex: '3fffff', flight: 'GAFS73Z' })).toBe('EUFI')
    expect(rareRoleFor({ hex: '3fffff', flight: 'GAFS73Z', t: '' })).toBe('Myśliwiec')
  })
  it('reguła po znaku nie nadpisuje typu z ADS-B ani nie łapie innych GAF', () => {
    expect(applyKnown({ hex: '3fffff', flight: 'GAFS73Z', t: 'A400' }).t).toBe('A400')
    expect(applyKnown({ hex: '3fffff', flight: 'GAF648', t: '' }).t).toBe('')
  })
  it('kody ICAO myśliwców mają nazwy', () => {
    expect(getCommonName('RFAL')).toBe('Rafale')
    expect(getCommonName('JS39')).toBe('Gripen')
    expect(getCommonName('MIR2')).toBe('Mirage 2000')
  })
})
