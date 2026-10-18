import { describe, it, expect } from 'vitest'
import { dedupeByDevice, cooldownMapEqual, toCooldownMap } from '../netlify/functions/notify.js'

describe('dedupeByDevice', () => {
  it('leaves records without a deviceId untouched', () => {
    const subs = [
      { key: 'a', raw: {} },
      { key: 'b', raw: { updatedAt: 1 } },
    ]
    expect(dedupeByDevice(subs)).toHaveLength(2)
  })

  it('keeps only the freshest endpoint per device', () => {
    const subs = [
      { key: 'old', raw: { deviceId: 'dev1', updatedAt: 100 } },
      { key: 'new', raw: { deviceId: 'dev1', updatedAt: 500 } },
    ]
    const out = dedupeByDevice(subs)
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('new')
  })

  it('keeps distinct devices separate', () => {
    const subs = [
      { key: 'a', raw: { deviceId: 'dev1', updatedAt: 100 } },
      { key: 'b', raw: { deviceId: 'dev2', updatedAt: 100 } },
    ]
    expect(dedupeByDevice(subs)).toHaveLength(2)
  })

  it('mixes device-tagged dedupe with untagged passthrough', () => {
    const subs = [
      { key: 'a', raw: { deviceId: 'dev1', updatedAt: 100 } },
      { key: 'b', raw: { deviceId: 'dev1', updatedAt: 200 } },
      { key: 'c', raw: {} },
    ]
    const out = dedupeByDevice(subs)
    expect(out).toHaveLength(2)
    expect(out.map(o => o.key).sort()).toEqual(['b', 'c'])
  })
})

describe('cooldownMapEqual', () => {
  it('two empty maps are equal', () => {
    expect(cooldownMapEqual({}, {})).toBe(true)
  })
  it('same content in different key order is equal', () => {
    expect(cooldownMapEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
  })
  it('differing values are not equal', () => {
    expect(cooldownMapEqual({ a: 1 }, { a: 2 })).toBe(false)
  })
  it('differing key counts are not equal', () => {
    expect(cooldownMapEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })
})

describe('toCooldownMap', () => {
  const NOW = 1_000_000

  it('an absent record yields an empty map', () => {
    expect(toCooldownMap(null, NOW)).toEqual({})
    expect(toCooldownMap(undefined, NOW)).toEqual({})
  })

  it('reads the current single-map format', () => {
    expect(toCooldownMap({ alerted: { abc: 5 } }, NOW)).toEqual({ abc: 5 })
  })

  it('merges the legacy far/near split into one map', () => {
    expect(toCooldownMap({ far: { abc: 5 }, near: { def: 7 } }, NOW))
      .toEqual({ abc: 5, def: 7 })
  })

  it('keeps the freshest timestamp when a hex is in both legacy maps', () => {
    expect(toCooldownMap({ far: { abc: 5 }, near: { abc: 9 } }, NOW)).toEqual({ abc: 9 })
    expect(toCooldownMap({ far: { abc: 9 }, near: { abc: 5 } }, NOW)).toEqual({ abc: 9 })
  })

  it('treats the oldest `hexes` array as just-alerted', () => {
    expect(toCooldownMap({ hexes: ['abc', 'def'] }, NOW)).toEqual({ abc: NOW, def: NOW })
  })
})

// The eligibility rule the handler applies: one cooldown per hex, shared by
// every category. A plane already alerted as "w zasięgu" must not fire again
// when it crosses inside CLOSE_RANGE_KM, nor when adsb.fi reclassifies it.
describe('shared cooldown eligibility', () => {
  const COOLDOWN = 45 * 60 * 1000
  const NOW = 1_000_000_000
  const eligible = (map, hex) => !map[hex] || (NOW - map[hex]) > COOLDOWN

  it('blocks a near alert for a plane already alerted at range', () => {
    const map = toCooldownMap({ far: { abc: NOW - 60_000 } }, NOW)
    expect(eligible(map, 'abc')).toBe(false)
  })

  it('blocks a near alert for a plane first alerted as a service helicopter', () => {
    const map = toCooldownMap({ alerted: { abc: NOW - 60_000 } }, NOW)
    expect(eligible(map, 'abc')).toBe(false)
  })

  it('allows a fresh alert once the cooldown has lapsed', () => {
    const map = toCooldownMap({ alerted: { abc: NOW - COOLDOWN - 1 } }, NOW)
    expect(eligible(map, 'abc')).toBe(true)
  })

  it('allows an alert for an aircraft never seen before', () => {
    expect(eligible(toCooldownMap({ alerted: { abc: NOW } }, NOW), 'zzz')).toBe(true)
  })
})

describe('planAlerts', async () => {
  const { planAlerts } = await import('../netlify/functions/notify.js')
  const all = () => true
  const mil = (hex, d) => ({ hex, flight: hex.toUpperCase(), t: 'C17', kind: 'mil', _dist: d })

  it('wojsko blisko pojedynczo (od najbliższego), w zasięgu jednym zbiorczym', () => {
    const { payloads, near, far } = planAlerts([mil('a2', 8), mil('a1', 3), mil('b1', 40), mil('b2', 60)], all)
    expect(payloads.map(p => p.tag)).toEqual(['a1', 'a2', 'mil-far-group'])
    expect([near, far]).toEqual([2, 2])
    expect(payloads[0]).toEqual(expect.objectContaining({ hex: 'a1', title: expect.any(String), body: expect.any(String) }))
  })

  it('przy gęstym niebie blisko też zbiorczo', () => {
    const { payloads } = planAlerts([1, 2, 3, 4].map(i => mil(`n${i}`, i)), all)
    expect(payloads.map(p => p.tag)).toEqual(['mil-near-group'])
  })

  it('pojedyncza maszyna w grupie ma za tag swój hex; śmigłowce i duże osobno', () => {
    const { payloads } = planAlerts([
      mil('b1', 50),
      { hex: 'h1', kind: 'heli', t: 'EC35', _dist: 20 },
      { hex: 'j1', kind: 'heavy', t: 'B748', _dist: 70 }, { hex: 'j2', kind: 'heavy', t: 'A124', _dist: 30 },
    ], all)
    expect(payloads.map(p => [p.tag, p.hex])).toEqual([['b1', 'b1'], ['heavy-group', 'j2'], ['h1', 'h1']])
  })

  it('maszyny w cooldownie pomija', () => {
    const { payloads } = planAlerts([mil('a1', 3), mil('b1', 40)], hex => hex !== 'a1')
    expect(payloads.map(p => p.tag)).toEqual(['b1'])
  })
})
