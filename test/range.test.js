import { describe, it, expect } from 'vitest'
import { RANGE_ANCHORS, RANGE_SEG, rangePosToKm, rangeKmToPos } from '../src/lib/range.js'

describe('range slider mapping', () => {
  it('anchors map to their exact slider positions', () => {
    // 25→0, 100→100, 250→200, 500→300
    expect(rangeKmToPos(25)).toBe(0)
    expect(rangeKmToPos(100)).toBe(RANGE_SEG)
    expect(rangeKmToPos(250)).toBe(2 * RANGE_SEG)
    expect(rangeKmToPos(500)).toBe(3 * RANGE_SEG)
  })

  it('slider positions at anchors return the anchor km', () => {
    expect(rangePosToKm(0)).toBe(25)
    expect(rangePosToKm(RANGE_SEG)).toBe(100)
    expect(rangePosToKm(2 * RANGE_SEG)).toBe(250)
    expect(rangePosToKm(3 * RANGE_SEG)).toBe(500)
  })

  it('round-trips every anchor', () => {
    for (const km of RANGE_ANCHORS) {
      expect(rangePosToKm(rangeKmToPos(km))).toBe(km)
    }
  })

  it('snaps to nice steps (multiples of 5/10/25)', () => {
    for (let pos = 0; pos <= 3 * RANGE_SEG; pos++) {
      const km = rangePosToKm(pos)
      const step = km < 100 ? 5 : km < 250 ? 10 : 25
      expect(km % step).toBe(0)
    }
  })

  it('is monotonic non-decreasing across the track', () => {
    let prev = -Infinity
    for (let pos = 0; pos <= 3 * RANGE_SEG; pos++) {
      const km = rangePosToKm(pos)
      expect(km).toBeGreaterThanOrEqual(prev)
      prev = km
    }
  })
})
