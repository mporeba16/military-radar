import { describe, it, expect } from 'vitest'
import { validatePosition, cleanDeviceId } from '../netlify/functions/lib/security.js'

describe('validatePosition', () => {
  it('przepuszcza poprawną pozycję i zasięg', () => {
    expect(validatePosition({ lat: 50.06, lon: 19.94, radius: 100 })).toEqual({ lat: 50.06, lon: 19.94, radius: 100 })
  })

  it('brak pól to „bez zmian”, nie błąd', () => {
    expect(validatePosition({})).toEqual({ lat: null, lon: null, radius: null })
  })

  it('odrzuca tekst zamiast liczby — w sumie skleiłby napisy i zepsuł środek wszystkim', () => {
    expect(validatePosition({ lat: '52', lon: 19 }).error).toBe('invalid-position')
    expect(validatePosition({ lat: 52, lon: 19, radius: '100' }).error).toBe('invalid-radius')
  })

  it('odrzuca pozycję poza zakresem, NaN i samą szerokość bez długości', () => {
    expect(validatePosition({ lat: 95, lon: 19 }).error).toBe('invalid-position')
    expect(validatePosition({ lat: NaN, lon: 19 }).error).toBe('invalid-position')
    expect(validatePosition({ lat: 52 }).error).toBe('invalid-position')
  })

  it('przycina zasięg do zakresu suwaka 25–500 km', () => {
    expect(validatePosition({ radius: 1_000_000 }).radius).toBe(500)
    expect(validatePosition({ radius: 1 }).radius).toBe(25)
  })
})

describe('cleanDeviceId', () => {
  it('krótki napis zostaje, reszta odpada', () => {
    expect(cleanDeviceId('abc-123')).toBe('abc-123')
    expect(cleanDeviceId('x'.repeat(101))).toBe(null)
    expect(cleanDeviceId({ a: 1 })).toBe(null)
  })
})
