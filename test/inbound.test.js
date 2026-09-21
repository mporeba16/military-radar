import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  etaMinutes, distanceKm, formatEta, landingClock, isWatchedType, airportByIcao,
  approachGuess, headingDiff,
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

// 70 km na zachód od Rzeszowa (ten sam równoleżnik) — kurs na lotnisko to 90°,
// a Rzeszów jest stąd najbliższym dużym lotniskiem.
const westOfEPRZ = extra => ({
  lat: 50.11, lon: 21.04, gs: 300, track: 90, alt_baro: 8000, ...extra,
})

describe('approachGuess', () => {
  it('rozpoznaje podejście bez trasy z bazy', () => {
    const g = approachGuess(westOfEPRZ())
    expect(g?.airport.icao).toBe('EPRZ')
    expect(g.etaMin).toBeGreaterThan(3)
    expect(g.etaMin).toBeLessThan(15)
  })

  it('nie bierze przelotu na wysokości przelotowej', () => {
    // Cargo Air China nad Polską w drodze do Chin: ten sam kurs, FL350.
    expect(approachGuess(westOfEPRZ({ alt_baro: 35000 }))).toBeNull()
  })

  it('nie bierze maszyny lecącej w drugą stronę', () => {
    expect(approachGuess(westOfEPRZ({ track: 270 }))).toBeNull()
  })

  it('nie bierze maszyny na ziemi ani bez kursu', () => {
    expect(approachGuess(westOfEPRZ({ on_ground: true }))).toBeNull()
    expect(approachGuess(westOfEPRZ({ track: null }))).toBeNull()
  })

  it('nie sięga poza okolice Polski', () => {
    // Nad Atlantykiem kurs może się zgadzać, ale to jeszcze nie podejście.
    expect(approachGuess({ lat: 50, lon: 0, gs: 480, track: 90, alt_baro: 20000 })).toBeNull()
  })

  it('odrzuca cel, gdy bliżej maszyny jest inne duże lotnisko', () => {
    // Nad Lubelszczyzną, kursem na południe: kurs celuje w Rzeszów, ale
    // Lublin jest trzy razy bliżej — to tam ta maszyna schodzi.
    expect(approachGuess({ lat: 51.0, lon: 22.4, gs: 300, track: 180, alt_baro: 10000 })).toBeNull()
  })

  it('wskazuje Kraków maszynie podchodzącej od zachodu', () => {
    const g = approachGuess({ lat: 50.08, lon: 19.3, gs: 250, track: 90, alt_baro: 5000 })
    expect(g?.airport.icao).toBe('EPKK')
  })
})

describe('headingDiff', () => {
  it('liczy różnicę przez zero', () => {
    expect(headingDiff(350, 10)).toBe(20)
    expect(headingDiff(10, 350)).toBe(20)
    expect(headingDiff(0, 180)).toBe(180)
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

  it('łapie czarter bez wpisu w bazie tras, gdy podchodzi do lądowania', async () => {
    // NCR844 — National Airlines, typowy czarter towarowy do Rzeszowa.
    // adsbdb takiego znaku nie zna, więc liczy się wyłącznie geometria lotu.
    const near = [{
      hex: 'b7', flight: 'NCR844 ', t: 'B744', r: 'N729CA',
      lat: 50.11, lon: 21.04, gs: 300, track: 90, alt_baro: 8000,
    }]
    vi.stubGlobal('fetch', async (url) => {
      const u = String(url)
      if (/v2\/type\//.test(u)) return { ok: true, status: 200, json: async () => ({ ac: [] }) }
      if (/adsb\.fi/.test(u)) return { ok: true, status: 200, json: async () => ({ ac: near }) }
      return { ok: true, status: 200, json: async () => ({ response: { flightroute: null } }) }
    })

    vi.resetModules()
    const { handler } = await import('../netlify/functions/inbound.js')
    const res = await handler({ httpMethod: 'GET', headers: {} })
    const body = JSON.parse(res.body)
    expect(body.inbound).toHaveLength(1)
    expect(body.inbound[0]).toMatchObject({
      flight: 'NCR844', route: { to: 'EPRZ', guess: true },
    })
  }, 30000)
})

describe('treść powiadomienia', () => {
  const x = {
    hex: 'a0b1c2', flight: 'GTI4521', t: 'B748',
    route: { from: 'KORD', fromCity: 'Chicago', to: 'EPRZ' },
  }

  it('w tytule lotnisko i godzina, w treści maszyna i skąd', async () => {
    const { inboundText } = await import('../src/lib/notifyText.js')
    const { title, body } = inboundText(x, 'Rzeszów', '17:10', '3 h 13 min')
    expect(title).toBe('Rzeszów: Jumbo Jet ok. 17:10')
    expect(body).not.toContain('GTI4521')
    expect(body).toContain('z Chicago')
    expect(body).toContain('za 3 h 13 min')
  })

  it('przy celu zgadniętym z lotu nie obiecuje planu', async () => {
    const { inboundText } = await import('../src/lib/notifyText.js')
    const guessed = { ...x, route: { to: 'EPRZ', guess: true } }
    const { title, body } = inboundText(guessed, 'Rzeszów', '17:10', '22 min')
    expect(title).toBe('Jumbo Jet podchodzi: Rzeszów')
    expect(body).toContain('ok. 17:10')
    expect(body).toContain('za 22 min')
  })

  it('cel z pamięci mówi, skąd go zna', async () => {
    const { inboundText } = await import('../src/lib/notifyText.js')
    const zPamieci = { ...x, route: { to: 'EPRZ', learned: true } }
    const { title, body } = inboundText(zPamieci, 'Rzeszów', '17:10', '6 h 20 min')
    expect(title).toBe('Jumbo Jet → Rzeszów ok. 17:10')
    expect(body).toContain('cel z wcześniejszych lotów')
    expect(body).toContain('za 6 h 20 min')
  })

  it('bez godziny nie zmyśla', async () => {
    const { inboundText } = await import('../src/lib/notifyText.js')
    expect(inboundText(x, 'Kraków', null, null).title).toBe('Kraków: Jumbo Jet')
  })
})

describe('carryForward', () => {
  it('przenosi maszyny z trasy, gubi stare zgadnięte podejścia', async () => {
    const { carryForward } = await import('../netlify/functions/inbound.js')
    const fresh = [{ hex: 'a1', etaMin: 5, route: { to: 'EPRZ', guess: true } }]
    const prev = [
      { hex: 'a1', etaMin: 40, route: { to: 'EPRZ', guess: true } },
      { hex: 'b2', etaMin: 200, route: { to: 'EPRZ' } },
      { hex: 'c3', etaMin: 9, route: { to: 'EPKK', guess: true } },
    ]
    const out = carryForward(fresh, prev)
    expect(out.map(x => x.hex)).toEqual(['a1', 'b2'])
  })
})

describe('pamięć lądowań', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Sklep Blobs udawany w pamięci — interesuje nas, CO zapisujemy i czy
  // potrafimy to odczytać przy następnym locie.
  const fakeStore = () => {
    const data = new Map()
    return {
      data,
      get: async (k) => data.get(k) ?? null,
      set: async (k, v) => { data.set(k, JSON.parse(v)); return { catch: () => {} } },
    }
  }

  it('zapamiętuje maszynę, która siada w Rzeszowie', async () => {
    vi.resetModules()
    const { learnLandings } = await import('../netlify/functions/inbound.js')
    const store = fakeStore()
    const zapis = await learnLandings([
      // Na progu pasa w Rzeszowie — to lądowanie.
      { flight: 'CMB336', t: 'B744', lat: 50.11, lon: 22.02, alt_baro: 800 },
      // Przelot nad Rzeszowem na wysokości przelotowej — nie liczy się.
      { flight: 'CAO1189', t: 'B744', lat: 50.11, lon: 22.02, alt_baro: 35000 },
      // Nisko, ale 200 km od obserwowanych lotnisk.
      { flight: 'GTI999', t: 'B744', lat: 52.2, lon: 21.0, alt_baro: 900 },
    ], store)

    expect(zapis).toEqual(['CMB336→EPRZ'])
    expect(store.data.get('landed-CMB336')).toMatchObject({ to: 'EPRZ' })
    expect(store.data.has('landed-CAO1189')).toBe(false)
    expect(store.data.has('landed-GTI999')).toBe(false)
  })

  it('następnym razem alarmuje zaraz po starcie, zza oceanu', async () => {
    // Ten sam znak wywoławczy, tym razem nad Atlantykiem tuż po starcie
    // z Dover. Żadna baza tras go nie zna, geometria podejścia milczy
    // (4000 km od Rzeszowa) — zostaje pamięć wcześniejszego lądowania.
    const daleko = [{
      hex: 'a9876e', flight: 'CMB336 ', t: 'B744', r: 'N713CK',
      lat: 45.0, lon: -40.0, gs: 500, track: 60, alt_baro: 35000,
    }]
    vi.stubGlobal('fetch', async (url) => {
      const u = String(url)
      if (/v2\/type\//.test(u)) return { ok: true, status: 200, json: async () => ({ ac: daleko }) }
      if (/adsb\.fi/.test(u)) return { ok: true, status: 200, json: async () => ({ ac: [] }) }
      return { ok: true, status: 200, json: async () => ({ response: { flightroute: null } }) }
    })

    // Lądowanie zapamiętuje JEDEN przebieg, a lot sprzed oceanu widzi inny,
    // wiele godzin później — czyli inna instancja funkcji, z pustą pamięcią
    // podręczną. Dlatego uczymy w jednym module, a pytamy w świeżo wczytanym:
    // liczy się to, co przetrwało w Blobs.
    const store = fakeStore()
    vi.resetModules()
    const uczacy = await import('../netlify/functions/inbound.js')
    await uczacy.learnLandings([{ flight: 'CMB336', t: 'B744', lat: 50.11, lon: 22.02, alt_baro: 800 }], store)

    vi.resetModules()
    const mod = await import('../netlify/functions/inbound.js')
    const out = await mod.collect({ deep: true, store })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ flight: 'CMB336', route: { to: 'EPRZ', learned: true } })
  }, 30000)
})
