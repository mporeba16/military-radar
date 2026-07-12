import { describe, it, expect } from 'vitest'
import { dedupeByDevice, cooldownMapEqual } from '../netlify/functions/notify.js'

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
