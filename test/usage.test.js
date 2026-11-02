import { describe, it, expect, vi, beforeEach } from 'vitest'
import { summarize, deviceHash, usageRecord, warsawDay, lastDays } from '../netlify/functions/lib/usage.js'
import { detectPlatform } from '../src/hooks/useUsagePing.js'

const NOW = Date.UTC(2026, 10, 2, 12)

describe('licznik użytkowników — liczenie', () => {
  it('dziennie, tygodniowo, miesięcznie: unikalne urządzenia', () => {
    const [d0, d1, , , , , , d7] = lastDays(30, NOW)
    const out = summarize({ [d0]: ['a', 'b'], [d1]: ['a', 'c'], [d7]: ['d'] }, [], NOW)
    expect(out).toMatchObject({ day: '2026-11-02', dau: 2, wau: 3, mau: 4 })
    expect(out.daily[0]).toEqual({ day: '2026-11-02', n: 2 })
    expect(out.daily).toHaveLength(14)
  })

  it('podział z ostatnich 7 dni: instalacja, push, platforma', () => {
    const out = summarize({}, [
      { standalone: true, push: true, platform: 'ios' },
      { standalone: false, push: false, platform: 'desktop' },
    ], NOW)
    expect(out.week).toEqual({ devices: 2, standalone: 1, push: 1, platform: { ios: 1, android: 0, desktop: 1, other: 0 } })
  })

  it('dzień liczony w czasie polskim (23:30 UTC to już następny dzień)', () => {
    expect(warsawDay(Date.UTC(2026, 10, 2, 23, 30))).toBe('2026-11-03')
  })
})

describe('licznik użytkowników — prywatność i dane wejściowe', () => {
  it('zapisuje skrót, nie identyfikator; ten sam identyfikator → ten sam skrót', () => {
    const h = deviceHash('3f0c-uuid')
    expect(h).toMatch(/^[0-9a-f]{20}$/)
    expect(h).not.toContain('3f0c')
    expect(deviceHash('3f0c-uuid')).toBe(h)
  })

  it('z ciała zapytania bierze tylko znane pola i wartości', () => {
    expect(usageRecord({ standalone: 'tak', push: true, platform: 'tv', extra: 'x' }))
      .toEqual({ standalone: false, push: true, platform: 'other' })
  })

  it('rozpoznaje platformę', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios') // iPad
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
  })
})

// Funkcja na wspólnym magazynie w pamięci.
const data = new Map()
vi.mock('@netlify/blobs', () => ({
  connectLambda: () => {},
  getStore: () => ({
    set: async (k, v) => { data.set(k, v) },
    get: async (k) => (data.has(k) ? JSON.parse(data.get(k)) : null),
    list: async ({ prefix }) => ({ blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }),
  }),
}))

describe('funkcja usage', () => {
  beforeEach(() => { data.clear(); vi.resetModules() })

  it('dwa sygnały z jednego urządzenia tego samego dnia to jedno urządzenie', async () => {
    const { handler } = await import('../netlify/functions/usage.js')
    const post = body => handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) })
    expect((await post({ id: 'dev-1', standalone: true, push: true, platform: 'ios' })).statusCode).toBe(204)
    await post({ id: 'dev-1', standalone: true, push: true, platform: 'ios' })
    await post({ id: 'dev-2', platform: 'desktop' })
    const stats = JSON.parse((await handler({ httpMethod: 'GET', headers: {} })).body)
    expect(stats).toMatchObject({ dau: 2, wau: 2, mau: 2, week: { devices: 2, standalone: 1, push: 1 } })
    // W magazynie nie ma identyfikatorów, tylko skróty.
    expect([...data.keys()].join()).not.toMatch(/dev-/)
  })

  it('bez identyfikatora — 400', async () => {
    const { handler } = await import('../netlify/functions/usage.js')
    const res = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ platform: 'ios' }) })
    expect(res.statusCode).toBe(400)
    expect(data.size).toBe(0)
  })
})
