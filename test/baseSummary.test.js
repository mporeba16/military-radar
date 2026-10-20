import { describe, it, expect } from 'vitest'
import { basePlan } from '../src/lib/baseSummary.js'

const H = 3600_000
// 20.10.2026 08:00 czasu polskiego
const T = Date.UTC(2026, 9, 20, 6, 0)
const zone = (id, res) => ({ id, type: 'TSA', rings: [], res })
const r = (unit, rem, s, e) => ({ unit, rem, s: T + s * H, e: T + e * H, lo: 'GND', hi: 'F245' })

describe('basePlan', () => {
  it('tylko ta baza, sektory scalone, zakończone odpadają', () => {
    const zones = [
      zone('EPTS7A', [r('EPLK', 'F35', 2, 3), r('EPKS', 'F16', 4, 5)]),
      zone('EPTS7B', [r('EPLK', 'F35', 2, 3)]),
      zone('EPTS6A', [r('EPLK', 'F35/W', 0, 1), r('EPLK', 'F35', 6, 7)]),
    ]
    const plan = basePlan('EPLK', zones, T + 2.5 * H)
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ types: ['F-35'], active: true })
    expect(plan[0].windows).toEqual([{ s: T + 2 * H, e: T + 3 * H }, { s: T + 6 * H, e: T + 7 * H }])
  })

  it('AN28 i M28 to ta sama maszyna — jeden wiersz (Radom)', () => {
    const plan = basePlan('EPRA', [
      zone('EPTR5A', [r('EPRA', 'PZL130 M28 M346', 3, 13)]),
      zone('EPTR5B', [r('EPRA', 'M346 AN28 PZL130', 3, 13)]),
    ], T)
    expect(plan).toHaveLength(1)
    expect(plan[0].types).toEqual(['M28'])
  })

  it('typy z tymi samymi godzinami dzielą wiersz, szkolne odpadają (Dęblin)', () => {
    const plan = basePlan('EPDE', [
      zone('EPTR4A', [r('EPDE', 'M346', 4, 9)]),
      zone('EPTR182', [r('EPDE', 'M346 SW4 MI2', 4, 12)]),
      zone('EPTR180', [r('EPDE', 'MI2 SW4 DA20 C150', 6, 12)]),
    ], T)
    expect(plan).toHaveLength(1)
    expect(plan[0].types).toEqual(['SW-4', 'Mi-2'])
    expect(plan[0].windows).toEqual([{ s: T + 4 * H, e: T + 12 * H }])
  })

  it('skoki spadochronowe (PJE) są widoczne, rezerwacja bez maszyny nie', () => {
    const plan = basePlan('EPTM', [
      zone('EPTR23F', [r('EPTM', 'PJE', 7, 12)]),
      zone('EPTR400', [r('EPTM', 'SUP163/26/CLN', 7, 8)]),
    ], T)
    expect(plan.map(p => p.types)).toEqual([['Skoki']])
  })

  it('jutrzejsze wiersze mają znacznik', () => {
    const plan = basePlan('EPRA', [zone('EPTR5A', [r('EPRA', 'M28', 23, 24)])], T)
    expect(plan[0].tomorrow).toBe(true)
  })

  it('pusto dla bazy bez planu', () => {
    expect(basePlan('EPMB', [], T)).toEqual([])
    expect(basePlan('EPLK', null, T)).toEqual([])
  })
})
