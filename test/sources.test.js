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

describe('wspólna migawka ticka', () => {
  const lpr = { hex: '48c001', flight: 'LPR1', r: 'SP-HXA', t: 'EC35', lat: 50.0, lon: 19.9, alt_baro: 1500 }

  it('powiadomienia korzystają z danych pobranych przez tick — bez zapytań do sieci', async () => {
    const fetchSpy = vi.fn(async () => { throw new Error('nie powinno pytać sieci') })
    vi.stubGlobal('fetch', fetchSpy)
    const { shareSnapshot, fetchMilitaryNear, fetchMilGlobal } = await load()
    shareSnapshot({
      milRes: { status: 'fulfilled', value: { records: [reach, italian], errors: [] } },
      geoRes: { status: 'fulfilled', value: [lpr] },
    })
    const out = await fetchMilitaryNear(50.06, 19.94, 100)
    expect(out.map(a => a.hex).sort()).toEqual(['33ff01', '48c001', 'ae1234'])
    expect((await fetchMilGlobal()).length).toBe(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('koło wychodzące poza wspólne zapytanie geograficzne — pyta samo', async () => {
    routeFetch({ 'opendata.adsb.fi/api/v2/lat/': json({ ac: [] }) })
    const { shareSnapshot, fetchMilitaryNear } = await load()
    shareSnapshot({
      milRes: { status: 'fulfilled', value: { records: [], errors: [] } },
      geoRes: { status: 'fulfilled', value: [] },
    })
    // Lizbona — daleko poza kołem 250 nm wokół środka Polski.
    await fetchMilitaryNear(38.7, -9.1, 100)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/lat/38.7000/lon/-9.1000/'), expect.anything())
  })

  it('nieudane pobranie w ticku — powiadomienia próbują same', async () => {
    routeFetch({
      'opendata.adsb.fi/api/v2/mil': json({ ac: [reach] }),
      'api.adsb.lol/v2/mil': json({ ac: [] }),
    })
    const { shareSnapshot, fetchMilGlobal } = await load()
    shareSnapshot({ milRes: { status: 'rejected', reason: new Error('429') }, geoRes: { status: 'rejected' } })
    expect((await fetchMilGlobal()).map(a => a.hex)).toEqual(['ae1234'])
  })
})

describe('fetchAdsbLolTypes', () => {
  const fast = { gapMs: 0, retryMs: 0 }

  it('typ, który padł, nie zabiera pozostałych; po 429 jedno ponowienie', async () => {
    let b748 = 0
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url)
      if (u.endsWith('/A124')) throw new Error('timeout')
      if (u.endsWith('/B748')) return ++b748 === 1 ? json({}, 429) : json({ ac: [{ hex: 'b1', t: 'B748' }] })
      return json({ ac: [{ hex: 'c1', t: 'B744' }, { hex: 'b1', t: 'B744' }] })
    }))
    const { fetchAdsbLolTypes } = await load()
    const out = await fetchAdsbLolTypes(['A124', 'B748', 'B744'], fast)
    expect(out.records.map(a => a.hex)).toEqual(['b1', 'c1'])
    expect(out.fetched).toEqual(['B748', 'B744'])
    expect(out.failed).toEqual([expect.stringContaining('A124')])
    expect(b748).toBe(2)
  })
})

describe('nieudany ruch nad Polską w ticku', () => {
  it('powiadomienia nie pytają adsb.fi drugi raz — fetchAdsbfiGeo już ponawiał', async () => {
    routeFetch({})
    const { shareSnapshot, fetchMilitaryNear, sharedGeo } = await load()
    shareSnapshot({
      milRes: { status: 'fulfilled', value: { records: [reach], errors: [] } },
      geoRes: { status: 'rejected', reason: new Error('timeout') },
    })
    expect(sharedGeo()).toEqual([])
    const out = await fetchMilitaryNear(50.06, 19.94, 100)
    expect(out.map(a => a.hex)).toEqual(['ae1234'])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('bez migawki ticka (wywołanie spoza crona) — brak wspólnych danych', async () => {
    const { sharedGeo } = await load()
    expect(sharedGeo()).toBeUndefined()
  })
})
