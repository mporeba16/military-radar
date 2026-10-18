import { describe, it, expect } from 'vitest'
import { isQuietHours, warsawHour } from '../netlify/functions/lib/quietHours.js'

describe('cisza nocna 1:00–6:00 czasu polskiego', () => {
  it('liczy godzinę w Warszawie, nie w UTC (lato: UTC+2, zima: UTC+1)', () => {
    expect(warsawHour(new Date('2026-07-01T23:30:00Z'))).toBe(1)
    expect(warsawHour(new Date('2026-01-15T23:30:00Z'))).toBe(0)
  })

  it('cisza od 1:00 do 5:59, a nie o 0:59 ani o 6:00', () => {
    expect(isQuietHours(new Date('2026-07-01T22:59:00Z'))).toBe(false) // 0:59
    expect(isQuietHours(new Date('2026-07-01T23:00:00Z'))).toBe(true)  // 1:00
    expect(isQuietHours(new Date('2026-07-02T03:59:00Z'))).toBe(true)  // 5:59
    expect(isQuietHours(new Date('2026-07-02T04:00:00Z'))).toBe(false) // 6:00
  })
})
