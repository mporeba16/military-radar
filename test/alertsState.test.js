import { describe, it, expect } from 'vitest'
import { alertsLevel, kindsOnCount, KIND_ROWS } from '../src/lib/alertsState.js'

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

describe('alertsLevel', () => {
  it('bez GPS nic nie zadziała', () => {
    expect(alertsLevel({ hasGps: false, pushOn: true, kindsOn: 3 })).toBe('off')
  })

  it('wyłączone kategorie i brak pusha to ostrzeżenie, nie awaria', () => {
    expect(alertsLevel({ hasGps: true, pushOn: true, kindsOn: 0 })).toBe('warn')
    expect(alertsLevel({ hasGps: true, pushOn: false, kindsOn: 2 })).toBe('warn')
  })

  it('komplet warunków to stan gotowy', () => {
    expect(alertsLevel({ hasGps: true, pushOn: true, kindsOn: 3 })).toBe('ok')
  })
})
