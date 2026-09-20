import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  etaMinutes, distanceKm, formatEta, landingClock, isWatchedType, airportByIcao,
} from '../src/lib/inbound.js'

const EPRZ = airportByIcao('EPRZ')

describe('etaMinutes', () => {
  it('liczy czas dolotu z prędkości i odległości', () => {
    // ~440 km na zachód od Rzeszowa, 480 kt (889 km/h) → ok. 30 min
    const ac = { lat: 50.11, lon: 15.8, gs: 480 }
    expect(distanceKm(ac, EPRZ)).toBeGreaterThan(400)
    expect(etaMinutes(ac, EPRZ)).toBeGreaterThan(20)
    expect(etaMinutes(ac, EPRZ)).toBeLessThan(40)
  })

  it('nie zgaduje bez prędkości ani dla maszyny na ziemi', () => {
    expect(etaMinutes({ lat: 50, lon: 20, gs: null }, EPRZ)).toBeNull()
    expect(etaMinutes({ lat: 50, lon: 20, gs: 12 }, EPRZ)).toBeNull()
  })
})

describe('format', () => {
  it('pokazuje godziny i minuty', () => {
    expect(formatEta(47)).toBe('47 min')
    expect(formatEta(190)).toBe('3 h 10 min')
    expect(formatEta(null)).toBeNull()
  })

  it('podaje godzinę lądowania czasu polskiego', () => {
    // 2026-09-20 12:00 UTC + 190 min = 15:10 UTC = 17:10 w Polsce
    expect(landingClock(190, Date.parse('2026-09-20T12:00:00Z'))).toBe('17:10')
  })
})

describe('isWatchedType', () => {
  it('bierze jumbo jety i Rusłana, resztę pomija', () => {
    expect(isWatchedType('B744')).toBe(true)
    expect(isWatchedType('b748')).toBe(true)
    expect(isWatchedType('A124')).toBe(true)
    expect(isWatchedType('B77L')).toBe(false)
    expect(isWatchedType('C17')).toBe(false)
  })
})

describe('funkcja inbound', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('zostawia tylko maszyny lecące do Rzeszowa albo Krakowa', async () => {
    const planes = {
      B744: [
        { hex: 'a1', flight: 'GTI123 ', t: 'B744', r: 'N123GT', lat: 50.11, lon: 15.8, gs: 480, track: 90, alt_baro: 35000 },
        { hex: 'a2', flight: 'CLX999 ', t: 'B744', r: 'LX-ABC', lat: 49, lon: 8, gs: 470, track: 90, alt_baro: 33000 },
      ],
    }
    const routes = {
      GTI123: { origin: { icao_code: 'KORD', municipality: 'Chicago' }, destination: { icao_code: 'EPRZ', municipality: 'Rzeszów' } },
      CLX999: { origin: { icao_code: 'ELLX' }, destination: { icao_code: 'EDDF' } },
    }
    vi.stubGlobal('fetch', async (url) => {
      const u = String(url)
      const type = u.match(/v2\/type\/(\w+)/)?.[1]
      if (type) return { ok: true, status: 200, json: async () => ({ ac: planes[type] || [] }) }
      const cs = u.match(/callsign\/(\w+)/)?.[1]
      return { ok: true, status: 200, json: async () => ({ response: { flightroute: routes[cs] || null } }) }
    })

    const { handler } = await import('../netlify/functions/inbound.js')
    const res = await handler({ httpMethod: 'GET', headers: {} })
    const body = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(body.inbound).toHaveLength(1)
    expect(body.inbound[0]).toMatchObject({ hex: 'a1', flight: 'GTI123', route: { to: 'EPRZ', fromCity: 'Chicago' } })
    expect(body.inbound[0].etaMin).toBeGreaterThan(20)
  }, 30000)
})
