import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// Każdy test ładuje moduł od nowa — fetchMilGlobal trzyma 20 s pamięci w instancji.
async function load() {
  vi.resetModules()
  return import('../netlify/functions/lib/sources.js')
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function routeFetch(routes) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    for (const [part, res] of Object.entries(routes)) {
      if (String(url).includes(part)) return typeof res === 'function' ? res() : res.clone()
    }
    throw new Error(`nieoczekiwany adres ${url}`)
  }))
}

// Nad Krakowem, w powietrzu
const reach = { hex: 'ae1234', flight: 'RCH123', t: 'C17', lat: 50.1, lon: 19.9, alt_baro: 30000 }
// Włoski C-130J — tylko w adsb.lol
const italian = { hex: '33ff01', flight: 'IAM4640', t: 'C30J', lat: 50.2, lon: 20.0, alt_baro: 20000 }

beforeEach(() => { vi.useRealTimers() })
afterEach(() => { vi.unstubAllGlobals() })

describe('fetchMilMerged', () => {
  it('scala adsb.fi i adsb.lol po hexie — maszyna tylko z adsb.lol też jest', async () => {
    routeFetch({
      'opendata.adsb.fi/api/v2/mil': json({ ac: [reach] }),
      'api.adsb.lol/v2/mil': json({ ac: [reach, italian] }),
    })
    const { fetchMilMerged } = await load()
    const { records, errors } = await fetchMilMerged()
    expect(records.map(a => a.hex)).toEqual(['ae1234', '33ff01'])
    expect(errors).toEqual([])
  })

  it('jedno źródło padło — dane z drugiego i opis błędu z kodem HTTP', async () => {
    routeFetch({
      'opendata.adsb.fi/api/v2/mil': json({}, 403),
      'api.adsb.lol/v2/mil': json({ ac: [italian] }),
    })
    const { fetchMilMerged } = await load()
    const { records, errors } = await fetchMilMerged()
    expect(records.map(a => a.hex)).toEqual(['33ff01'])
    expect(errors[0]).toMatch(/opendata\.adsb\.fi HTTP 403/)
  })

  it('padły oba — rzuca', async () => {
    routeFetch({
      'opendata.adsb.fi/api/v2/mil': json({}, 429),
      'api.adsb.lol/v2/mil': json({}, 500),
    })
    const { fetchMilMerged } = await load()
    await expect(fetchMilMerged()).rejects.toThrow(/HTTP 429.*HTTP 500/)
  })
})

describe('fetchMilitaryNear (powiadomienia)', () => {
  it('alarmuje także o maszynie widocznej tylko w adsb.lol; pomija ziemię i dalsze niż promień', async () => {
    const onGround = { ...reach, hex: 'ae9999', alt_baro: 'ground' }
    const far = { ...reach, hex: 'ae8888', lat: 54.4, lon: 18.6 } // Gdańsk
    routeFetch({
      'opendata.adsb.fi/api/v2/mil': json({ ac: [reach, onGround, far] }),
      'api.adsb.lol/v2/mil': json({ ac: [italian] }),
      'opendata.adsb.fi/api/v2/lat/': json({ ac: [] }),
    })
    const { fetchMilitaryNear } = await load()
    const out = await fetchMilitaryNear(50.06, 19.94, 100) // Kraków, 100 km
    expect(out.map(a => a.hex).sort()).toEqual(['33ff01', 'ae1234'])
    expect(out.every(a => a.kind === 'mil')).toBe(true)
  })

  it('z zapytania geograficznego bierze służbowy śmigłowiec, ale nie zwykły samolot', async () => {
    const lpr = { hex: '48c001', flight: 'LPR1', r: 'SP-HXA', t: 'EC35', lat: 50.0, lon: 19.9, alt_baro: 1500 }
    const airliner = { hex: '48a001', flight: 'LOT3', t: 'B738', lat: 50.0, lon: 19.8, alt_baro: 9000 }
    routeFetch({
      'opendata.adsb.fi/api/v2/mil': json({ ac: [] }),
      'api.adsb.lol/v2/mil': json({ ac: [] }),
      'opendata.adsb.fi/api/v2/lat/': json({ ac: [lpr, airliner] }),
    })
    const { fetchMilitaryNear } = await load()
    const out = await fetchMilitaryNear(50.06, 19.94, 100)
    expect(out.map(a => [a.hex, a.kind])).toEqual([['48c001', 'heli']])
  })
})
