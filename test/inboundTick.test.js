import { describe, it, expect, vi, beforeEach } from 'vitest'

// Przyloty w ticku: lista typów przychodzi z Cloudflare (`deep-raw`), trasy
// rozwiązujemy tutaj — raz na nową listę, a między nimi tylko ruch nad Polską.
const stores = new Map()
const store = name => {
  if (!stores.has(name)) stores.set(name, new Map())
  const m = stores.get(name)
  return {
    get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, v) },
  }
}
vi.mock('@netlify/blobs', () => ({ getStore: n => store(typeof n === 'string' ? n : n.name), connectLambda: () => {} }))

let routeCalls = 0
vi.stubGlobal('fetch', async (url) => {
  const u = String(url)
  if (/adsbdb/.test(u)) {
    routeCalls++
    return { ok: true, status: 200, json: async () => ({ response: { flightroute: {
      origin: { icao_code: 'KORD', municipality: 'Chicago' },
      destination: { icao_code: 'EPRZ', municipality: 'Rzeszów' },
    } } }) }
  }
  throw new Error(`nieoczekiwany adres ${u}`)
})

// 747 nad Atlantykiem, lecący do Rzeszowa (trasa z bazy).
const jumbo = { hex: 'a1', flight: 'GTI123 ', t: 'B744', lat: 50, lon: -20, gs: 480, track: 85, alt_baro: 35000 }
const snap = () => JSON.parse(stores.get('inbound-snapshot').get('latest'))

describe('collectInbound', () => {
  beforeEach(() => { stores.clear(); routeCalls = 0 })

  it('nowa lista z Cloudflare → przebieg pełny; kolejne ticki ją przenoszą bez ponownego rozwiązywania', async () => {
    store('inbound-snapshot').set('deep-raw', JSON.stringify({ at: Date.now(), aircraft: [jumbo] }))
    const { collectInbound } = await import('../netlify/functions/inbound.js')

    expect(await collectInbound([])).toMatch(/n=1 pełny/)
    expect(snap().inbound[0]).toMatchObject({ hex: 'a1', route: { to: 'EPRZ' } })
    const calls = routeCalls

    expect(await collectInbound([])).not.toMatch(/pełny/)
    expect(snap().inbound.map(x => x.hex)).toEqual(['a1'])
    expect(routeCalls).toBe(calls)
  })

  it('stara lista (Cloudflare nie działa) — bez maszyn zza oceanu', async () => {
    store('inbound-snapshot').set('deep-raw', JSON.stringify({ at: Date.now() - 60 * 60 * 1000, aircraft: [jumbo] }))
    const { collectInbound } = await import('../netlify/functions/inbound.js')
    expect(await collectInbound([])).toMatch(/brak świeżej listy/)
    expect(snap().inbound).toEqual([])
  })
})
