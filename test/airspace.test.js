import { describe, it, expect } from 'vitest'
import {
  altToMetres, formatAltRange, describeRemarks, isMilitaryReservation,
  activeReservation, groupKey, shortName, trimZones, milUnitSet,
} from '../src/lib/airspace.js'

const MIL = milUnitSet([{ icao: 'EPLK' }, { icao: 'EPKS' }])

function feature(designator, type, reservations) {
  return {
    type: 'Feature',
    properties: { designator, airspaceElementType: type, airspaceReservations: reservations },
    geometry: { type: 'Polygon', coordinates: [[[19, 51], [19.5, 51], [19.5, 51.5], [19, 51]]] },
  }
}
const res = (unit, remarks, start = '2026-09-18T08:00:00Z', end = '2026-09-18T10:00:00Z') =>
  ({ startDate: start, endDate: end, lowerAltitude: 'A035', upperAltitude: 'F245', unit, remarks })

describe('altToMetres', () => {
  it('reads GND, altitude and flight level', () => {
    expect(altToMetres('GND')).toBe(0)
    expect(altToMetres('A035')).toBe(1067)
    expect(altToMetres('F245')).toBe(7468)
    expect(altToMetres('xyz')).toBeNull()
  })

  it('formats a range in metres, falling back to raw codes', () => {
    // Polski zapis nie grupuje liczb czterocyfrowych: 1050, ale 11 582.
    expect(formatAltRange('A035', 'F245')).toBe('1050–7450 m')
    expect(formatAltRange('GND', 'F455')).toBe('0–13\u00a0850 m') // separator to twarda spacja
    expect(formatAltRange('GND', 'A020')).toBe('0–610 m')
    expect(formatAltRange('?', 'F245')).toBe('?–F245')
  })
})

describe('describeRemarks', () => {
  it('keeps aircraft types and exercise names, drops procedural tokens', () => {
    expect(describeRemarks('F35/CLN/W')).toEqual(['F-35'])
    expect(describeRemarks('NOT.D6513/26/ORZEL')).toEqual(['ORZEL'])
    expect(describeRemarks('PZL130 M28 M346')).toEqual(['PZL-130', 'M28', 'M-346'])
    expect(describeRemarks('HUSAR/W')).toEqual(['HUSAR'])
  })

  it('collapses drone markers into one word, first', () => {
    expect(describeRemarks('OATC/SUP09/26/BSP/UAV/')).toEqual(['drony'])
    expect(describeRemarks(null)).toEqual([])
  })
})

describe('isMilitaryReservation', () => {
  it('accepts military units and military airfields, rejects aeroclubs', () => {
    expect(isMilitaryReservation({ unit: 'COP' }, MIL)).toBe(true)
    expect(isMilitaryReservation({ unit: 'EPLK' }, MIL)).toBe(true)
    expect(isMilitaryReservation({ unit: 'EPRA' }, MIL)).toBe(true)
    expect(isMilitaryReservation({ unit: 'EPBC' }, MIL)).toBe(false)
    expect(isMilitaryReservation({ unit: 'ZZZZ' }, MIL)).toBe(false)
  })
})

describe('trimZones', () => {
  it('keeps military reservations of relevant types only', () => {
    const zones = trimZones([
      feature('EPTS7A', 'TSA', [res('EPLK', 'F35')]),
      feature('EPTR1', 'TRA', [res('EPBC', 'GLD/CLN')]),
      feature('EPATZ', 'ATZ', [res('MIL', '')]),
    ], [], MIL)
    expect(zones.map(z => z.id)).toEqual(['EPTS7A'])
    expect(zones[0].rings[0][0]).toEqual([51, 19]) // [lat, lon]
    expect(zones[0].res[0]).toMatchObject({ unit: 'EPLK', rem: 'F35', lo: 'A035', hi: 'F245' })
  })

  it('lets UUP replace the AUP entry for the same structure', () => {
    const zones = trimZones(
      [feature('EPTS2A', 'TSA', [res('EPKS', 'F16')])],
      [feature('EPTS2A', 'TSA', [res('EPKS', 'HUSAR')])],
      MIL,
    )
    expect(zones).toHaveLength(1)
    expect(zones[0].res[0].rem).toBe('HUSAR')
  })

  it('survives missing fields', () => {
    expect(trimZones([{}, { properties: {} }, null], undefined, MIL)).toEqual([])
  })
})

describe('helpers', () => {
  it('finds the reservation running now', () => {
    const r = [{ s: 0, e: 10 }, { s: 20, e: 30 }]
    expect(activeReservation(r, 25)).toBe(r[1])
    expect(activeReservation(r, 15)).toBeNull()
  })

  it('groups sectors and shortens names', () => {
    expect(groupKey('EPTS7A')).toBe('EPTS7')
    expect(groupKey('EPD25B')).toBe('EPD25')
    expect(groupKey('EPTR700')).toBe('EPTR700')
    expect(shortName('EPTS7')).toBe('TS7')
  })
})
