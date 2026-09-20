import { describe, it, expect } from 'vitest'
import { readiness, kindsOnCount, KIND_ROWS } from '../src/lib/alertsState.js'

describe('kindsOnCount', () => {
  it('liczy włączone kategorie', () => {
    expect(kindsOnCount({ mil: true, heli: true, heavy: true })).toBe(3)
    expect(kindsOnCount({ mil: true, heli: false, heavy: false })).toBe(1)
    expect(kindsOnCount({})).toBe(0)
    // `rare` to przełącznik powiadomień, nie kategoria mapy
    expect(kindsOnCount({ rare: true })).toBe(0)
    expect(KIND_ROWS.map(k => k.key)).toEqual(['mil', 'heli', 'heavy'])
  })
})

describe('readiness', () => {
  it('bez GPS nic nie zadziała', () => {
    const r = readiness({ hasGps: false, pushOn: true, kindsOn: 3 })
    expect(r.level).toBe('off')
    expect(r.retry).toBe(true)
  })

  it('brak zgody na lokalizację nie proponuje ponowienia', () => {
    const r = readiness({ hasGps: false, pushOn: true, kindsOn: 3, locationError: 'Brak zgody na lokalizację' })
    expect(r.level).toBe('off')
    expect(r.retry).toBe(false)
  })

  it('wyłączone kategorie i brak pusha to ostrzeżenie, nie awaria', () => {
    expect(readiness({ hasGps: true, pushOn: true, kindsOn: 0 }).level).toBe('warn')
    expect(readiness({ hasGps: true, pushOn: false, kindsOn: 2 }).level).toBe('warn')
  })

  it('komplet warunków to stan gotowy', () => {
    const r = readiness({ hasGps: true, pushOn: true, kindsOn: 3 })
    expect(r.level).toBe('ok')
    expect(r.why).toBeNull()
  })
})
