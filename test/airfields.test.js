import { describe, it, expect } from 'vitest'
import { AIRFIELDS, MIL_BASES_PL, MIL_BASES_NATO } from '../src/airfields.js'

// Baza lotnisk jest ręcznie utrzymywaną listą rysowaną na mapie — literówka w
// kodzie ICAO albo przestawione lat/lon nie wywalą builda, tylko po cichu
// postawią bazę w złym miejscu. Stąd te sprawdzenia.
describe('AIRFIELDS', () => {
  it('nie ma zduplikowanych kodów ICAO', () => {
    const seen = new Set()
    const dups = []
    for (const a of AIRFIELDS) {
      if (seen.has(a.icao)) dups.push(a.icao)
      seen.add(a.icao)
    }
    expect(dups).toEqual([])
  })

  it('każdy wpis ma sensowny kod, nazwę i współrzędne', () => {
    for (const a of AIRFIELDS) {
      expect(a.icao, `${a.name}: kod ICAO`).toMatch(/^[A-Z]{4}$/)
      expect(a.name?.length, `${a.icao}: nazwa`).toBeGreaterThan(0)
      expect(a.lat, `${a.icao}: lat`).toBeGreaterThan(-90)
      expect(a.lat, `${a.icao}: lat`).toBeLessThan(90)
      expect(a.lon, `${a.icao}: lon`).toBeGreaterThan(-180)
      expect(a.lon, `${a.icao}: lon`).toBeLessThan(180)
    }
  })

  it('kod ICAO zgadza się z półkulą/regionem współrzędnych', () => {
    // Pierwsza litera kodu ICAO niesie region — gdyby lat/lon zostały
    // przestawione albo wklejone z innego wiersza, ta reguła to złapie.
    const REGION = {
      E: { lat: [35, 72], lon: [-12, 32] },   // północna i środkowa Europa
      L: { lat: [27, 56], lon: [-32, 45] },   // południowa Europa (z Azorami)
      B: { lat: [59, 84], lon: [-75, -12] },  // Islandia / Grenlandia
    }
    for (const a of AIRFIELDS) {
      const r = REGION[a.icao[0]]
      if (!r) continue
      expect(a.lat, `${a.icao} (${a.name}) lat`).toBeGreaterThanOrEqual(r.lat[0])
      expect(a.lat, `${a.icao} (${a.name}) lat`).toBeLessThanOrEqual(r.lat[1])
      expect(a.lon, `${a.icao} (${a.name}) lon`).toBeGreaterThanOrEqual(r.lon[0])
      expect(a.lon, `${a.icao} (${a.name}) lon`).toBeLessThanOrEqual(r.lon[1])
    }
  })
})

describe('warstwy baz', () => {
  it('polska warstwa to wyłącznie wojskowe lotniska EP*', () => {
    expect(MIL_BASES_PL.length).toBeGreaterThan(5)
    for (const a of MIL_BASES_PL) {
      expect(a.icao.startsWith('EP')).toBe(true)
      expect(a.mil).toBe(true)
    }
  })

  it('warstwa NATO zawiera główne bazy i żadnej polskiej', () => {
    const codes = MIL_BASES_NATO.map(a => a.icao)
    for (const expected of ['ETAR', 'ETNG', 'EGUL', 'LIPA', 'EYSA', 'LTAG', 'BIKF']) {
      expect(codes).toContain(expected)
    }
    expect(codes.some(c => c.startsWith('EP'))).toBe(false)
  })

  it('każda baza NATO liczy się też jako wojskowa przy szacowaniu lądowania', () => {
    for (const a of MIL_BASES_NATO) expect(a.mil).toBe(true)
  })

  it('warstwy się nie przecinają', () => {
    const pl = new Set(MIL_BASES_PL.map(a => a.icao))
    expect(MIL_BASES_NATO.filter(a => pl.has(a.icao))).toEqual([])
  })
})
