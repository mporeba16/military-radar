import { describe, it, expect } from 'vitest'
import { blockCategory, buildBlocks, blocksForDay, orderForList, startsIn, zoneNames, blockStatus } from '../src/lib/dayPlan.js'

const H = 3600_000
// 20.10.2026 12:00 czasu polskiego = 10:00 UTC
const T12 = Date.UTC(2026, 9, 20, 10, 0)
const res = (s, e, unit, rem, lo = 'F095', hi = 'F245') => ({ s, e, unit, rem, lo, hi })

const zones = [
  { id: 'EPTR11A', res: [res(T12, T12 + 2.5 * H, 'EPLK', 'F35/F16/W', 'F135', 'F245')] },
  { id: 'EPTR11B', res: [res(T12, T12 + 2.5 * H, 'EPLK', 'F35/F16/W', 'A035', 'F245')] },
  { id: 'EPTS7A', res: [res(T12, T12 + 2.5 * H, 'EPLK', 'F35', 'A035', 'F245')] },
  { id: 'EPTS3B', res: [res(T12 - 3 * H, T12 - 1.5 * H, 'EPDE', 'M346/CLN/W')] },
  { id: 'EPTR154', res: [res(T12 + 1 * H, T12 + 3 * H, 'MIL', 'W3', 'GND', 'A025')] },
  { id: 'EPD30', res: [res(T12 - 4 * H, T12 + 5 * H, 'MIL', '7661/26', 'GND', 'A040')] },
  { id: 'EPTS16B', res: [res(T12 + 26 * H, T12 + 28 * H, 'EPDA', 'AW101', 'GND', 'A020')] },
]
const names = { EPLK: 'Łask', EPDE: 'Dęblin', EPDA: 'Darłowo' }

describe('buildBlocks', () => {
  const blocks = buildBlocks(zones, names)
  const lask = blocks.find(b => b.unit === 'EPLK')
  it('scala strefy jednego lotu w blok', () => {
    expect(blocks.filter(b => b.unit === 'EPLK')).toHaveLength(1)
    expect(lask.zones).toEqual(['EPTR11A', 'EPTR11B', 'EPTS7A'])
    expect(lask.zoneNames).toEqual(['TR11', 'TS7'])
    expect(lask.types).toEqual(['F-35', 'F-16'])
    expect(lask.who).toBe('Łask')
    expect(lask.category).toBe('fighter')
  })
  it('bierze najniższy dół i najwyższą górę', () => {
    expect(lask.lo).toBe('A035')
    expect(lask.hi).toBe('F245')
  })
  it('kategorie', () => {
    expect(blocks.find(b => b.unit === 'EPDE').category).toBe('training')
    expect(blocks.find(b => b.zones.includes('EPTR154')).category).toBe('heli')
  })
  it('bloki bez rozpoznanej maszyny (samo „wojsko", kryptonim) odpadają', () => {
    const extra = buildBlocks([{ id: 'EPTR23F', res: [res(T12, T12 + H, 'EPLY', 'PJE', 'A055', 'F195')] }], names)
    expect(extra).toHaveLength(0)
    expect(blocks.some(b => b.zones.includes('EPD30'))).toBe(false)
  })
})

describe('dni i kolejność', () => {
  const blocks = buildBlocks(zones, names)
  it('dziś bez jutrzejszych, jutro osobno', () => {
    const today = blocksForDay(blocks, 'today', T12)
    expect(today.some(b => b.unit === 'EPDA')).toBe(false)
    expect(blocksForDay(blocks, 'tomorrow', T12).map(b => b.unit)).toEqual(['EPDA'])
  })
  it('trwające, potem nadchodzące, zakończone na końcu', () => {
    const order = orderForList(blocksForDay(blocks, 'today', T12), T12).map(b => blockStatus(b, T12))
    expect(order).toEqual(['active', 'upcoming', 'past'])
  })
  it('startsIn', () => {
    expect(startsIn({ s: T12 + 40 * 60000 }, T12)).toBe('za 40 min')
    expect(startsIn({ s: T12 + 135 * 60000 }, T12)).toBe('za 2 h 15 min')
    expect(startsIn({ s: T12 + 2 * H }, T12)).toBe('za 2 h')
  })
})

describe('pomocnicze', () => {
  it('blockCategory', () => {
    expect(blockCategory(['Eurofighter'])).toBe('fighter')
    expect(blockCategory(['M-346', 'SW-4', 'Mi-2'])).toBe('heli')
    expect(blockCategory(['PZL-130', 'M28', 'M-346'])).toBe('training')
    expect(blockCategory([])).toBe('other')
  })
  it('zoneNames', () => {
    expect(zoneNames(['EPMRT47', 'EPMRT48', 'EPTS6A'])).toEqual(['MRT47', 'MRT48', 'TS6'])
  })
})
