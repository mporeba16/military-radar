import { describe, it, expect } from 'vitest'
import {
  parseUbilling,
  readAdsbSignals,
  scoreAdsb,
  buildThreatState,
  updateBaseline,
  levelFor,
  REGIONS,
  BASELINE_DEFAULT,
} from '../netlify/functions/lib/threat.js'

// Kształt odpowiedzi ubilling.net.ua/aerialalerts (obcięty do tego, co czytamy).
function ubilling(activeNames = []) {
  const names = [
    'Волинська область', 'Львівська область', 'Закарпатська область',
    'Рівненська область', 'Тернопільська область',
    'Київська область', 'Харківська область',
  ]
  const states = {}
  for (const n of names) {
    states[n] = { alertnow: activeNames.includes(n), changed: '2026-09-17 18:00:00' }
  }
  return { source: 'test', cachedat: '2026-09-17 18:00:00', states }
}

const quietAdsb = { ok: true, milOverPoland: 2, isr: [], tankers: [] }

describe('parseUbilling', () => {
  it('wyciąga tylko obwody istotne dla Polski', () => {
    const ua = parseUbilling(ubilling(['Львівська область', 'Харківська область']))
    expect(ua.ok).toBe(true)
    expect(ua.alerts.map(a => a.key)).toEqual(['lviv'])
    expect(ua.alerts[0].pl).toBe('lwowski')
  })

  it('brak alarmów to nadal poprawna odpowiedź', () => {
    const ua = parseUbilling(ubilling([]))
    expect(ua.ok).toBe(true)
    expect(ua.alerts).toEqual([])
  })

  it('śmieci zamiast JSON-a nie wywracają parsera', () => {
    expect(parseUbilling(null).ok).toBe(false)
    expect(parseUbilling({}).ok).toBe(false)
    expect(parseUbilling({ states: 'nope' }).alerts).toEqual([])
  })
})

describe('readAdsbSignals', () => {
  const overWarsaw = { hex: 'abc123', t: 'F16', lat: 52.2, lon: 21.0, kind: 'mil' }

  it('liczy wojsko w prostokącie obserwacji', () => {
    const s = readAdsbSignals([
      overWarsaw,
      { hex: 'd1', t: 'F16', lat: 40.0, lon: 3.0, kind: 'mil' },   // Hiszpania — poza
    ])
    expect(s.milOverPoland).toBe(1)
  })

  it('pomija kategorie niewojskowe i maszyny na ziemi', () => {
    const s = readAdsbSignals([
      { ...overWarsaw, hex: 'h1', kind: 'heli' },
      { ...overWarsaw, hex: 'h2', kind: 'heavy' },
      { ...overWarsaw, hex: 'g1', on_ground: true },
    ])
    expect(s.milOverPoland).toBe(0)
  })

  it('rozpoznaje ISR i tankowce po kodzie typu', () => {
    const s = readAdsbSignals([
      { ...overWarsaw, hex: 'a1', t: 'E-3TF', flight: 'NATO01' },
      { ...overWarsaw, hex: 'a2', t: 'K35R', flight: 'RCH123' },
    ])
    expect(s.isr).toEqual(['NATO01'])
    expect(s.tankers).toEqual(['RCH123'])
    expect(s.milOverPoland).toBe(2)
  })

  it('cywilny A330 nie zostanie tankowcem — sprawdzamy tylko kind mil', () => {
    const s = readAdsbSignals([{ ...overWarsaw, hex: 'c1', t: 'A332', kind: 'heavy' }])
    expect(s.tankers).toEqual([])
  })

  it('brak snapshotu zgłasza ok=false zamiast udawać spokój', () => {
    expect(readAdsbSignals(null).ok).toBe(false)
  })
})

describe('scoreAdsb', () => {
  it('ruch na poziomie normy nie daje punktów', () => {
    expect(scoreAdsb({ ok: true, milOverPoland: 4, isr: [], tankers: [] }, 4).points).toBe(0)
  })

  it('samo ISR i tankowce nie dosięgają progu obserwacji', () => {
    // Najważniejsza własność kalibracji: przy spokojnym niebie i braku alarmów
    // w Ukrainie warstwa ma NIE świecić. 8 + 4 = 12, próg „obserwacji" to 15.
    const s = scoreAdsb({ ok: true, milOverPoland: 5, isr: ['FORTE12'], tankers: ['A', 'B'] }, 4.6)
    expect(s.surge).toBe(0)
    expect(s.points).toBe(12)
    expect(levelFor(s.points)).toBe('calm')
  })

  it('pojedynczy tankowiec nie punktuje wcale', () => {
    const s = scoreAdsb({ ok: true, milOverPoland: 5, isr: [], tankers: ['MMF61'] }, 4.6)
    expect(s.points).toBe(0)
  })

  it('zwykłe wahanie liczby maszyn nie jest nadwyżką', () => {
    // Dokładnie przypadek z produkcji: 7 maszyn przy normie 4,6.
    // Proporcja 1,52× < 1,75× i nadwyżka 2,4 < 4 — obie bramki zamknięte.
    const s = scoreAdsb({ ok: true, milOverPoland: 7, isr: [], tankers: ['ae0265', 'MMF61'] }, 4.6)
    expect(s.surge).toBe(0)
    expect(s.points).toBe(4)
    expect(levelFor(s.points)).toBe('calm')
  })

  it('nadwyżka musi przejść obie bramki naraz', () => {
    // duża proporcja, ale za mało maszyn bezwzględnie (2 przy normie 1)
    expect(scoreAdsb({ ok: true, milOverPoland: 3, isr: [], tankers: [] }, 1).surge).toBe(0)
    // duża liczba bezwzględna, ale za mała proporcja (5 przy normie 30)
    expect(scoreAdsb({ ok: true, milOverPoland: 35, isr: [], tankers: [] }, 30).surge).toBe(0)
    // obie spełnione
    expect(scoreAdsb({ ok: true, milOverPoland: 12, isr: [], tankers: [] }, 5).surge).toBeGreaterThan(0)
  })

  it('realna nadwyżka punktuje, ale z sufitem', () => {
    const s = scoreAdsb({ ok: true, milOverPoland: 40, isr: [], tankers: [] }, 4)
    expect(s.surge).toBe(15)
    expect(s.points).toBe(15)
  })

  it('cała część ADS-B jest ograniczona z góry', () => {
    const s = scoreAdsb({ ok: true, milOverPoland: 40, isr: ['A'], tankers: ['B', 'C'] }, 4)
    expect(s.points).toBe(25)
  })

  it('niedostępny snapshot to zero punktów, nie kara', () => {
    expect(scoreAdsb({ ok: false }, 4).points).toBe(0)
  })
})

describe('updateBaseline', () => {
  it('startuje od pierwszego odczytu, gdy nie ma historii', () => {
    expect(updateBaseline(undefined, 9)).toBe(9)
  })

  it('pełznie w stronę nowego odczytu, nie skacze', () => {
    const next = updateBaseline(4, 24)
    expect(next).toBeGreaterThan(4)
    expect(next).toBeLessThan(6)
  })

  it('ignoruje śmieci', () => {
    expect(updateBaseline(4, NaN)).toBe(4)
  })
})

describe('levelFor', () => {
  it('trzyma się progów', () => {
    expect(levelFor(0)).toBe('calm')
    expect(levelFor(14)).toBe('calm')
    expect(levelFor(15)).toBe('watch')
    expect(levelFor(40)).toBe('elevated')
    expect(levelFor(65)).toBe('high')
    expect(levelFor(100)).toBe('high')
  })
})

describe('buildThreatState', () => {
  const build = (activeNames, adsb = quietAdsb) => buildThreatState({
    ua: parseUbilling(ubilling(activeNames)),
    adsb,
    baseline: BASELINE_DEFAULT,
  })

  it('cisza w Ukrainie i spokojne niebo to poziom calm wszędzie', () => {
    const st = build([])
    expect(st.level).toBe('calm')
    expect(st.score).toBe(0)
    expect(st.regions.every(r => r.level === 'calm')).toBe(true)
    expect(st.regions).toHaveLength(REGIONS.length)
  })

  it('alarm w obwodzie lwowskim podnosi podkarpackie i lubelskie, nie całą Polskę', () => {
    const st = build(['Львівська область'])
    const by = Object.fromEntries(st.regions.map(r => [r.id, r]))
    expect(by.podkarpackie.level).toBe('elevated')
    expect(by.lubelskie.level).toBe('elevated')
    expect(by.mazowieckie.level).toBe('watch')     // druga linia
    expect(by.podlaskie.level).toBe('calm')        // inna granica, brak sygnału
    expect(by['warminsko-mazurskie'].level).toBe('calm')
  })

  it('alarm w dwóch przygranicznych obwodach wypycha lubelskie na high', () => {
    const st = build(['Львівська область', 'Волинська область'])
    const lubelskie = st.regions.find(r => r.id === 'lubelskie')
    expect(lubelskie.score).toBe(60)
    expect(lubelskie.level).toBe('elevated')
    expect(st.level).toBe('elevated')
  })

  it('ISR nad Polską dokłada się do alarmu i przekracza próg high', () => {
    const st = build(['Львівська область', 'Волинська область'], {
      ok: true, milOverPoland: 6, isr: ['FORTE12'], tankers: [],
    })
    const lubelskie = st.regions.find(r => r.id === 'lubelskie')
    expect(lubelskie.level).toBe('high')
    expect(lubelskie.reasons).toContain('rozpoznanie NATO w powietrzu: FORTE12')
  })

  it('samo ISR nad Polską nie podnosi już niczego', () => {
    const st = build([], { ok: true, milOverPoland: 6, isr: ['FORTE12'], tankers: [] })
    expect(st.level).toBe('calm')
    expect(st.regions.every(r => r.level === 'calm')).toBe(true)
  })

  it('realny skok ruchu potrafi podnieść podlaskie, dla którego nie ma feedu alarmowego', () => {
    const st = build([], { ok: true, milOverPoland: 14, isr: ['FORTE12'], tankers: [] })
    const podlaskie = st.regions.find(r => r.id === 'podlaskie')
    expect(podlaskie.level).toBe('watch')
    expect(podlaskie.reasons.some(r => r.includes('wzmożony ruch'))).toBe(true)
  })

  it('tankowce poniżej progu nie trafiają do powodów', () => {
    const st = build(['Львівська область'], { ok: true, milOverPoland: 5, isr: [], tankers: ['MMF61'] })
    const lubelskie = st.regions.find(r => r.id === 'lubelskie')
    expect(lubelskie.reasons.some(r => r.includes('tankowce'))).toBe(false)
  })

  it('każdy podniesiony region niesie powód — kolor bez wyjaśnienia to wróżenie', () => {
    const st = build(['Волинська область'])
    for (const r of st.regions) {
      if (r.level !== 'calm') expect(r.reasons.length).toBeGreaterThan(0)
    }
  })

  it('padnięte źródło ukraińskie jest widoczne w odpowiedzi, a nie udaje spokoju', () => {
    const st = buildThreatState({
      ua: { ok: false, alerts: [] },
      adsb: quietAdsb,
      baseline: BASELINE_DEFAULT,
    })
    expect(st.signals.ua.ok).toBe(false)
    expect(st.level).toBe('calm')
  })

  it('zastrzeżenie o braku urzędowego charakteru jedzie razem z danymi', () => {
    expect(build([]).disclaimer).toMatch(/RCB/)
  })
})
