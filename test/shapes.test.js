import { describe, it, expect } from 'vitest'
import { getShapeKey, SHAPES } from '../src/components/aircraftShapes.js'
import { getCommonName } from '../src/lib/typeNames.js'

// C-390 Millennium przychodzi z adsb.fi pod fabrycznym oznaczeniem Embraera
// (t: "E390", desc: "EMBRAER EMB-390"), a nie pod wojskowym C390/KC390. Reguła
// dla regionalnych Embraerów łapała ten kod pierwsza i dawała transportowcowi
// ikonę o połowę mniejszą niż reszta floty.
describe('C-390 Millennium', () => {
  it('E390 dostaje własny kształt, nie regionalnego odrzutowca', () => {
    expect(getShapeKey('E390')).toBe('c390')
  })

  it('wojskowe oznaczenia tej samej maszyny trafiają tam samo', () => {
    for (const t of ['C390', 'C39M', 'KC390', 'KC39']) {
      expect(getShapeKey(t)).toBe('c390')
    }
  })

  it('kontur jest pochodną C-17, więc dzieli z nim układ współrzędnych', () => {
    expect(SHAPES.c390.cx).toBe(SHAPES.c17.cx)
    expect(SHAPES.c390.cy).toBe(SHAPES.c17.cy)
    expect(SHAPES.c390.scale).toBeLessThan(SHAPES.c17.scale)
  })

  it('ma nazwę własną, więc powiadomienie nie mówi „E390"', () => {
    expect(getCommonName('E390')).toBe('C-390 Millennium')
  })
})

describe('rodzina E-Jet zostaje przy swoim kształcie', () => {
  it('regionalne Embraery i pochodne DC-9 nadal używają e390', () => {
    for (const t of ['E170', 'E175', 'E190', 'E195', 'E290', 'E295', 'MD80', 'DC9']) {
      expect(getShapeKey(t)).toBe('e390')
    }
  })
})

// Kształt e390 rysował się w 14,4 px szerokości, gdy cała reszta floty mieści
// się w 23–44 px. Skala liczona jest wprost ze ścieżki, więc pilnujemy jej
// wartości — pomiar w przeglądarce dał po zmianie 23,6 px.
describe('skala kształtów', () => {
  it('e390 nie jest już o połowę mniejszy od pozostałych', () => {
    expect(SHAPES.e390.scale).toBeGreaterThan(0.13)
  })

  it('każdy kształt ma komplet pól potrzebnych do złożenia ikony', () => {
    for (const [name, s] of Object.entries(SHAPES)) {
      expect(s.path, name).toBeDefined()
      expect(typeof s.scale, name).toBe('number')
      expect(s.scale, name).toBeGreaterThan(0)
      expect(typeof s.cx, name).toBe('number')
      expect(typeof s.cy, name).toBe('number')
    }
  })
})
