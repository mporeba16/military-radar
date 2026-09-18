import { describe, it, expect } from 'vitest'
import { formatFlightTime } from '../src/lib/flightTime.js'

const MIN = 60_000

describe('formatFlightTime', () => {
  it('shows minutes, then hours', () => {
    expect(formatFlightTime({ ts: 0, partial: false }, 47 * MIN)).toEqual({ val: '47', unit: 'min' })
    expect(formatFlightTime({ ts: 0, partial: false }, 83 * MIN)).toEqual({ val: '1:23', unit: 'h' })
  })

  it('marks a session-only start as a lower bound', () => {
    expect(formatFlightTime({ ts: 0, partial: true }, 12 * MIN)).toEqual({ val: '≥12', unit: 'min' })
    expect(formatFlightTime({ ts: 0, partial: true }, 30_000)).toBeNull()
  })

  it('returns null without a start', () => {
    expect(formatFlightTime(null)).toBeNull()
  })
})
