import { describe, it, expect } from 'vitest'
import { basePlan } from '../src/lib/baseSummary.js'

const H = 3600_000
const zone = (id, res) => ({ id, type: 'TSA', rings: [], res })
const r = (unit, rem, s, e) => ({ unit, rem, s, e, lo: 'GND', hi: 'F245' })

describe('basePlan', () => {
  const zones = [
    zone('EPTS7A', [r('EPLK', 'F35', 10 * H, 11 * H), r('EPKS', 'F16', 12 * H, 13 * H)]),
    zone('EPTS7B', [r('EPLK', 'F35', 10 * H, 11 * H)]),
    zone('EPTS6A', [r('EPLK', 'F35/W', 8 * H, 9 * H), r('EPLK', 'F35', 14 * H, 15 * H)]),
  ]

  it('keeps only this base, merges sectors, drops finished reservations', () => {
    const plan = basePlan('EPLK', zones, 10.5 * H)
    expect(plan).toHaveLength(2)
    expect(plan[0]).toMatchObject({ s: 10 * H, e: 11 * H, who: ['F-35'], zones: ['TS7'], active: true })
    expect(plan[1]).toMatchObject({ s: 14 * H, zones: ['TS6'], active: false })
  })

  it('merges overlapping windows of the same aircraft type across zones', () => {
    const plan = basePlan('EPLK', [
      zone('EPTS7A', [r('EPLK', 'F35', 10 * H, 11 * H)]),
      zone('EPTS7D', [r('EPLK', 'F35', 10 * H, 12 * H)]),
      zone('EPTS6A', [r('EPLK', 'F35/W', 10.5 * H, 12.2 * H)]),
      zone('EPTR11', [r('EPLK', 'F35', 11 * H, 12 * H)]),
    ], 9 * H)
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ s: 10 * H, e: 12.2 * H, zones: ['TR11', 'TS6', 'TS7'] })
  })

  it('is empty for a base with nothing planned', () => {
    expect(basePlan('EPMB', zones, 0)).toEqual([])
    expect(basePlan('EPLK', null, 0)).toEqual([])
  })
})
