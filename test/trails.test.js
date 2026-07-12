import { describe, it, expect } from 'vitest'
import { currentFlightOnly, filterImplausibleJumps } from '../netlify/functions/aircraft.js'

const GAP = 10 * 60 * 1000 + 1  // just over FLIGHT_SPLIT_GAP_MS

describe('currentFlightOnly', () => {
  it('returns input unchanged when fewer than 2 points', () => {
    expect(currentFlightOnly([])).toEqual([])
    const one = [{ ts: 1 }]
    expect(currentFlightOnly(one)).toEqual(one)
  })

  it('keeps a continuous flight intact', () => {
    const pts = [{ ts: 0 }, { ts: 15000 }, { ts: 30000 }]
    expect(currentFlightOnly(pts)).toHaveLength(3)
  })

  it('drops everything before the most recent long gap', () => {
    const pts = [
      { ts: 0 }, { ts: 15000 },
      { ts: 15000 + GAP }, { ts: 30000 + GAP },  // new flight after a >10 min gap
    ]
    const out = currentFlightOnly(pts)
    expect(out).toHaveLength(2)
    expect(out[0].ts).toBe(15000 + GAP)
  })
})

describe('filterImplausibleJumps', () => {
  it('keeps realistic movement', () => {
    // ~0.15° lon (~10 km) in 60 s → ~600 km/h, plausible
    const pts = [
      { lat: 52, lon: 20, ts: 0 },
      { lat: 52, lon: 20.15, ts: 60000 },
    ]
    expect(filterImplausibleJumps(pts)).toHaveLength(2)
  })

  it('drops a teleport (>2000 km/h implied)', () => {
    // 10° lon (~700 km) in 60 s → ~42000 km/h, impossible
    const pts = [
      { lat: 52, lon: 20, ts: 0 },
      { lat: 52, lon: 30, ts: 60000 },
    ]
    const out = filterImplausibleJumps(pts)
    expect(out).toHaveLength(1)
    expect(out[0].lon).toBe(20)
  })

  it('does not police jumps across gaps longer than 30 min', () => {
    const pts = [
      { lat: 52, lon: 20, ts: 0 },
      { lat: 52, lon: 30, ts: 40 * 60 * 1000 },  // far apart in time → not checked
    ]
    expect(filterImplausibleJumps(pts)).toHaveLength(2)
  })
})
