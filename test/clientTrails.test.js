import { describe, it, expect } from 'vitest'
import { updateClientTrails, TRAIL_FLIGHT_SPLIT_GAP_MS } from '../src/lib/clientTrails.js'
import { MLAT_MIN_INTERVAL_MS } from '../src/lib/trailFilter.js'

const T0 = 1_000_000_000
const ac = (over = {}) => ({ hex: 'ae1234', lat: 50, lon: 20, alt_baro: 30000, ...over })

describe('updateClientTrails', () => {
  it('dopisuje punkt nie częściej niż co 10 s', () => {
    const trails = new Map()
    updateClientTrails(trails, [ac()], T0)
    updateClientTrails(trails, [ac({ lat: 50.01 })], T0 + 5_000)
    updateClientTrails(trails, [ac({ lat: 50.02 })], T0 + 10_000)
    expect(trails.get('ae1234').map(p => p.lat)).toEqual([50, 50.02])
  })

  it('MLAT rzadziej i z flagą m', () => {
    const trails = new Map()
    updateClientTrails(trails, [ac({ mlat: true })], T0)
    updateClientTrails(trails, [ac({ mlat: true, lat: 50.1 })], T0 + MLAT_MIN_INTERVAL_MS - 1)
    expect(trails.get('ae1234')).toHaveLength(1)
    expect(trails.get('ae1234')[0].m).toBe(1)
  })

  it('maszyna na ziemi nie dostaje punktów, a długa przerwa zaczyna nowy lot', () => {
    const trails = new Map()
    updateClientTrails(trails, [ac()], T0)
    updateClientTrails(trails, [ac({ on_ground: true })], T0 + 20_000)
    expect(trails.get('ae1234')).toHaveLength(1)
    updateClientTrails(trails, [ac({ lat: 51 })], T0 + TRAIL_FLIGHT_SPLIT_GAP_MS + 1)
    expect(trails.get('ae1234').map(p => p.lat)).toEqual([51])
  })

  it('usuwa trasy maszyn, których nie ma już w danych', () => {
    const trails = new Map()
    updateClientTrails(trails, [ac(), ac({ hex: 'ae9999' })], T0)
    updateClientTrails(trails, [ac()], T0 + 10_000)
    expect([...trails.keys()]).toEqual(['ae1234'])
  })
})
