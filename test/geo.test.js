import { describe, it, expect } from 'vitest'
import { haversine, bearing } from '../src/lib/geo.js'

describe('haversine', () => {
  it('is zero for identical points', () => {
    expect(haversine(52, 21, 52, 21)).toBe(0)
  })

  it('matches a known Warsaw→Kraków distance (~252 km)', () => {
    // WAW 52.23,21.01  KRK 50.06,19.94
    const d = haversine(52.23, 21.01, 50.06, 19.94)
    expect(d).toBeGreaterThan(245)
    expect(d).toBeLessThan(260)
  })

  it('is symmetric', () => {
    const a = haversine(52.23, 21.01, 50.06, 19.94)
    const b = haversine(50.06, 19.94, 52.23, 21.01)
    expect(a).toBeCloseTo(b, 9)
  })

  it('~111 km per degree of latitude at the equator', () => {
    expect(haversine(0, 0, 1, 0)).toBeCloseTo(111.19, 0)
  })
})

describe('bearing', () => {
  it('due north is ~0°', () => {
    expect(bearing(50, 20, 51, 20)).toBeCloseTo(0, 5)
  })

  it('due east is ~90°', () => {
    expect(bearing(50, 20, 50, 21)).toBeGreaterThan(89)
    expect(bearing(50, 20, 50, 21)).toBeLessThan(91)
  })

  it('due south is ~180°', () => {
    expect(bearing(50, 20, 49, 20)).toBeCloseTo(180, 5)
  })

  it('always returns 0–360', () => {
    const b = bearing(50, 20, 49, 19)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})
