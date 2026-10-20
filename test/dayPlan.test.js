import { describe, it, expect } from 'vitest'
import { blockCategory, buildBlocks, blocksForDay, orderForList, startsIn, zoneNames, zoneSummary, mergeWindows, blockStatus } from '../src/lib/dayPlan.js'

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

describe('buildBlocks — blok na typ maszyny', () => {
  const blocks = buildBlocks(zones)
  const f35 = blocks.find(b => b.type === 'F-35')
  const f16 = blocks.find(b => b.type === 'F-16')
  it('slot „F35/F16" trafia do obu typów, strefy scalone', () => {
    expect(f35.zones).toEqual(['EPTR11A', 'EPTR11B', 'EPTS7A'])
    expect(f16.zones).toEqual(['EPTR11A', 'EPTR11B'])
    expect(f35.zonesText).toBe('2 strefy')
    expect(f35.category).toBe('fighter')
  })
  it('bierze najniższy dół i najwyższą górę', () => {
    expect(f35.lo).toBe('A035')
    expect(f35.hi).toBe('F245')
  })
  it('kategorie; szkolne bez własnego wiersza', () => {
    expect(blocks.some(b => b.type === 'M-346')).toBe(false)
    expect(blocks.find(b => b.type === 'W-3').category).toBe('heli')
  })
  it('bloki bez rozpoznanej maszyny (samo „wojsko", kryptonim) odpadają', () => {
    expect(buildBlocks([{ id: 'EPTR23F', res: [res(T12, T12 + H, 'EPLY', 'PJE', 'A055', 'F195')] }])).toHaveLength(0)
    expect(blocks.some(b => b.zones.includes('EPD30'))).toBe(false)
  })
})

describe('dni i kolejność', () => {
  const blocks = buildBlocks(zones)
  it('dziś bez jutrzejszych, jutro osobno', () => {
    const today = blocksForDay(blocks, 'today', T12)
    expect(today.some(b => b.type === 'AW101')).toBe(false)
    expect(blocksForDay(blocks, 'tomorrow', T12).map(b => b.type)).toEqual(['AW101'])
  })
  it('trwające, potem nadchodzące, zakończone na końcu', () => {
    const order = orderForList(blocksForDay(blocks, 'today', T12), T12).map(b => blockStatus(b, T12))
    expect(order).toEqual(['active', 'active', 'upcoming'])
  })
  it('zakończone idą na samą górę', () => {
    const past = { key: 'x', windows: [{ s: T12 - 3 * H, e: T12 - H }], s: T12 - 3 * H, e: T12 - H }
    const order = orderForList([...blocksForDay(blocks, 'today', T12), past], T12)
    expect(order[0]).toBe(past)
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

describe('scalanie dnia typu (F-16 z Krzesin i Łasku)', () => {
  const k = (s, e, id, unit = 'EPKS') => ({ id, res: [res(T12 + s * H, T12 + e * H, unit, 'F16')] })
  const blocks = buildBlocks([k(4, 7, 'EPTR11A'), k(4.33, 5.83, 'EPTS2A', 'EPLK'), k(8, 9, 'EPTR69A'), k(8, 11, 'EPMRT17'), k(8, 11, 'EPMRT18')])
  it('jeden blok z dwoma oknami', () => {
    expect(blocks).toHaveLength(1)
    expect(blocks[0].windows).toEqual([{ s: T12 + 4 * H, e: T12 + 7 * H }, { s: T12 + 8 * H, e: T12 + 11 * H }])
    expect(blocks[0].zonesText).toBe('3 strefy + 2 odcinki tras')
  })
  it('między oknami status „nadchodzi" i odliczanie do następnego', () => {
    const at = T12 + 7.5 * H
    expect(blockStatus(blocks[0], at)).toBe('upcoming')
    expect(startsIn(blocks[0], at)).toBe('za 30 min')
    expect(blockStatus(blocks[0], T12 + 9 * H)).toBe('active')
    expect(blockStatus(blocks[0], T12 + 12 * H)).toBe('past')
  })
  it('szkolne typy nie dostają wierszy, śmigłowce tak', () => {
    const types = buildBlocks([{ id: 'EPTR182', res: [res(T12, T12 + H, 'EPDE', 'M346 SW4 MI2 DA20')] }]).map(b => b.type)
    expect(types).toEqual(['SW-4', 'Mi-2'])
  })
  it('mergeWindows i zoneSummary', () => {
    expect(mergeWindows([{ s: 5, e: 8 }, { s: 1, e: 3 }, { s: 3, e: 4 }])).toEqual([{ s: 1, e: 4 }, { s: 5, e: 8 }])
    expect(zoneSummary(['EPTS6A', 'EPMRT17', 'EPMRT18', 'EPMRT19', 'EPMRT20', 'EPMRT21'])).toBe('1 strefa + 5 odcinków tras')
  })
})
