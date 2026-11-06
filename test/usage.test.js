import { describe, it, expect, vi, beforeEach } from 'vitest'
import { summarize, deviceHash, usageRecord, geoFromHeaders, warsawDay, lastDays } from '../netlify/functions/lib/usage.js'
import { detectPlatform } from '../src/hooks/useUsagePing.js'

const NOW = Date.UTC(2026, 10, 2, 12)

describe('licznik użytkowników — liczenie', () => {
  it('dziennie, tygodniowo, miesięcznie: unikalne urządzenia', () => {
    const [d0, d1, , , , , , d7] = lastDays(30, NOW)
    const out = summarize({ [d0]: ['a', 'b'], [d1]: ['a', 'c'], [d7]: ['d'] }, {}, NOW)
    expect(out).toMatchObject({ day: '2026-11-02', dau: 2, wau: 3, mau: 4 })
    expect(out.daily[0]).toMatchObject({ day: '2026-11-02', n: 2 })
    expect(out.daily).toHaveLength(14)
  })

  it('każdy dzień wykresu ma podział na platformy', () => {
    const [d0, d1] = lastDays(2, NOW)
    const out = summarize({ [d0]: ['a', 'b', 'c'], [d1]: ['a'] }, {
      [d0]: [{ platform: 'ios' }, { platform: 'android' }, { platform: 'ios' }],
      [d1]: [{ platform: 'desktop' }],
    }, NOW)
    expect(out.daily[0]).toMatchObject({ day: d0, n: 3, platform: { ios: 2, android: 1, desktop: 0, other: 0 } })
    expect(out.daily[1].platform).toEqual({ ios: 0, android: 0, desktop: 1, other: 0 })
    expect(out.daily[2].platform).toEqual({ ios: 0, android: 0, desktop: 0, other: 0 })
  })

  it('lista urządzeń dnia: platforma, miasto, godzina — od najwcześniejszego, bez identyfikatorów', () => {
    const [d0] = lastDays(1, NOW)
    const out = summarize({ [d0]: ['h1', 'h2'] }, {
      [d0]: [
        { platform: 'ios', city: 'Rzeszów', country: 'PL', at: NOW, push: true },
        { platform: 'android', city: null, country: 'PL', at: NOW - 3600_000 },
      ],
    }, NOW)
    expect(out.daily[0].devices).toEqual([
      { platform: 'android', city: null, country: 'PL', at: NOW - 3600_000 },
      { platform: 'ios', city: 'Rzeszów', country: 'PL', at: NOW },
    ])
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
    expect(usageRecord({ standalone: 'tak', push: true, platform: 'tv', extra: 'x', city: 'Fałsz' }, null, NOW))
      .toEqual({ standalone: false, push: true, platform: 'other', city: null, country: null, at: NOW })
  })

  it('miasto i kraj z geolokalizacji Netlify (x-nf-geo), bez adresu IP', () => {
    const header = Buffer.from(JSON.stringify({
      city: 'Rzeszów', country: { code: 'PL', name: 'Poland' }, subdivision: { code: '18' }, latitude: 50.04, longitude: 22.0,
    })).toString('base64')
    expect(geoFromHeaders({ 'x-nf-geo': header, 'x-nf-client-connection-ip': '1.2.3.4' }))
      .toEqual({ city: 'Rzeszów', country: 'PL' })
    expect(geoFromHeaders({ 'x-nf-geo': 'śmieci' })).toBeNull()
    expect(geoFromHeaders({})).toBeNull()
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

const call = async (method, body, geo) => {
  const { default: usage } = await import('../netlify/functions/usage.js')
  const req = new Request('https://radar.test/.netlify/functions/usage', {
    method, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' },
  })
  return usage(req, { geo })
}

describe('funkcja usage', () => {
  beforeEach(() => { data.clear(); vi.resetModules() })

  it('dwa sygnały z jednego urządzenia tego samego dnia to jedno urządzenie', async () => {
    expect((await call('POST', { id: 'dev-1', standalone: true, push: true, platform: 'ios' })).status).toBe(204)
    await call('POST', { id: 'dev-1', standalone: true, push: true, platform: 'ios' })
    await call('POST', { id: 'dev-2', platform: 'desktop' })
    const stats = await (await call('GET')).json()
    expect(stats).toMatchObject({ dau: 2, wau: 2, mau: 2 })
    expect(stats.daily[0].platform).toEqual({ ios: 1, android: 0, desktop: 1, other: 0 })
    expect(stats.daily[0].devices).toHaveLength(2)
    expect(JSON.stringify(stats)).not.toMatch(/dev-|[0-9a-f]{20}/)
  })

  it('miasto z context.geo (na produkcji stary format funkcji dostawał tylko kraj)', async () => {
    await call('POST', { id: 'dev-3', platform: 'android' }, { city: 'Rzeszów', country: { code: 'PL' } })
    const stats = await (await call('GET')).json()
    expect(stats.daily[0].devices[0]).toMatchObject({ platform: 'android', city: 'Rzeszów', country: 'PL' })
  })

  it('ponowny sygnał tego dnia uzupełnia miasto, ale zostawia godzinę pierwszego otwarcia', async () => {
    data.clear()
    await call('POST', { id: 'dev-4', platform: 'ios' })
    const [key] = [...data.keys()]
    const first = JSON.parse(data.get(key)).at
    await new Promise(r => setTimeout(r, 5))
    await call('POST', { id: 'dev-4', platform: 'ios' }, { city: 'Kraków', country: { code: 'PL' } })
    expect(JSON.parse(data.get(key))).toMatchObject({ city: 'Kraków', at: first })
  })

  it('bez identyfikatora — 400', async () => {
    const res = await call('POST', { platform: 'ios' })
    expect(res.status).toBe(400)
    expect(data.size).toBe(0)
  })
})
