import { describe, it, expect, vi, beforeEach } from 'vitest'

// Jeden cron na Cloudflare zamiast dwóch: te same trzy typy z adsb.lol
// zasilają migawkę nad Europą (co 5 min) i listę do przylotów (co ~10 min).
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
// Bez przerw między typami — w teście nie ma limitu adsb.lol.
vi.mock('../netlify/functions/lib/sources.js', async (orig) => {
  const mod = await orig()
  return { ...mod, fetchAdsbLolTypes: (types) => mod.fetchAdsbLolTypes(types, { gapMs: 0, retryMs: 0 }) }
})

const overBerlin = { hex: 'aa0001', flight: 'GTI1 ', t: 'B744', lat: 52.5, lon: 13.4, gs: 480, track: 90, alt_baro: 35000 }
const overAtlantic = { hex: 'aa0002', flight: 'CKS2 ', t: 'B748', lat: 50, lon: -30, gs: 500, track: 80, alt_baro: 36000 }
let failAll = false
vi.stubGlobal('fetch', async (url) => {
  if (failAll) return new Response('', { status: 429 })
  const type = String(url).match(/v2\/type\/(\w+)/)?.[1]
  const ac = [overBerlin, overAtlantic].filter(a => a.t === type)
  return new Response(JSON.stringify({ ac }), { status: 200 })
})

const read = (s, k) => JSON.parse(stores.get(s).get(k))

describe('types-collect', () => {
  beforeEach(() => { stores.clear(); failAll = false })

  it('jedno pobranie — obie migawki; lista do przylotów nie częściej niż co ~10 min', async () => {
    const { handler } = await import('../cloudflare/types-collect.js')
    expect((await handler()).body).toMatch(/heavy=1 deep-raw=2/)
    expect(read('heavy-europe', 'snapshot').aircraft.map(a => a.hex)).toEqual(['aa0001'])
    const first = read('inbound-snapshot', 'deep-raw')
    expect(first.aircraft.map(a => a.hex).sort()).toEqual(['aa0001', 'aa0002'])

    // Pięć minut później: migawka nad Europą tak, lista do przylotów nie.
    expect((await handler()).body).not.toMatch(/deep-raw/)
    expect(read('inbound-snapshot', 'deep-raw').at).toBe(first.at)
  })

  it('wszystkie typy na 429 — poprzednia lista do przylotów zostaje', async () => {
    store('inbound-snapshot').set('deep-raw', JSON.stringify({ at: 1, aircraft: [overAtlantic] }))
    failAll = true
    const { handler } = await import('../cloudflare/types-collect.js')
    expect((await handler()).body).toMatch(/błędy/)
    expect(read('inbound-snapshot', 'deep-raw')).toEqual({ at: 1, aircraft: [overAtlantic] })
  })
})
