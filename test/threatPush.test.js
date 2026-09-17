import { describe, it, expect } from 'vitest'
import {
  diffThreatForPush,
  DEESCALATION_DELAY_MS,
  PUSH_MIN_LEVEL,
} from '../netlify/functions/lib/threat.js'
import { regionIdAt } from '../src/lib/regionAt.js'
import { threatText } from '../src/lib/notifyText.js'

const T0 = Date.UTC(2026, 8, 17, 12, 0, 0)

// Minimalny stan w kształcie, jaki zwraca buildThreatState.
function state(levels) {
  return {
    regions: Object.entries(levels).map(([id, level]) => ({
      id,
      name: id,
      level,
      score: { calm: 0, watch: 20, elevated: 50, high: 80 }[level],
      reasons: level === 'calm' ? [] : [`powód dla ${id}`],
    })),
  }
}

describe('diffThreatForPush', () => {
  it('cisza nie budzi nikogo', () => {
    const { raised, next } = diffThreatForPush({}, state({ lubelskie: 'calm' }), T0)
    expect(raised).toEqual([])
    expect(next).toEqual({})
  })

  it('wzrost do obserwacji nie przekracza progu', () => {
    const { raised, next } = diffThreatForPush({}, state({ lubelskie: 'watch' }), T0)
    expect(raised).toEqual([])
    // ...ale zapamiętujemy poziom, żeby późniejszy skok do „podwyższonego"
    // policzył się jako jedno przekroczenie, a nie dwa.
    expect(next.lubelskie.level).toBe('watch')
  })

  it('wzrost do podwyższonego wysyła alert', () => {
    const { raised, next } = diffThreatForPush({}, state({ lubelskie: 'elevated' }), T0)
    expect(raised).toHaveLength(1)
    expect(raised[0]).toMatchObject({ id: 'lubelskie', level: 'elevated' })
    expect(raised[0].reasons).toEqual(['powód dla lubelskie'])
    expect(next.lubelskie).toEqual({ level: 'elevated', ts: T0 })
  })

  it('utrzymany poziom nie alarmuje po raz drugi', () => {
    const prev = { lubelskie: { level: 'elevated', ts: T0 } }
    const { raised } = diffThreatForPush(prev, state({ lubelskie: 'elevated' }), T0 + 60_000)
    expect(raised).toEqual([])
  })

  it('dalszy wzrost na wysoki alarmuje ponownie', () => {
    const prev = { lubelskie: { level: 'elevated', ts: T0 } }
    const { raised } = diffThreatForPush(prev, state({ lubelskie: 'high' }), T0 + 60_000)
    expect(raised).toHaveLength(1)
    expect(raised[0].level).toBe('high')
  })

  it('miganie poziomu w oknie histerezy nie wysyła drugiego alertu', () => {
    const prev = { lubelskie: { level: 'high', ts: T0 } }
    // spadek tuż po alercie — zapamiętany poziom się nie zmienia
    const down = diffThreatForPush(prev, state({ lubelskie: 'calm' }), T0 + 60_000)
    expect(down.raised).toEqual([])
    expect(down.next.lubelskie.level).toBe('high')
    // i powrót w górę też nie budzi, bo wg pamięci nigdy nie zeszliśmy
    const up = diffThreatForPush(down.next, state({ lubelskie: 'high' }), T0 + 120_000)
    expect(up.raised).toEqual([])
  })

  it('po okresie histerezy poziom schodzi i kolejny wzrost alarmuje na nowo', () => {
    const prev = { lubelskie: { level: 'high', ts: T0 } }
    const later = T0 + DEESCALATION_DELAY_MS + 1000
    const down = diffThreatForPush(prev, state({ lubelskie: 'calm' }), later)
    expect(down.next.lubelskie).toBeUndefined()   // wpisy calm są sprzątane
    const up = diffThreatForPush(down.next, state({ lubelskie: 'high' }), later + 60_000)
    expect(up.raised).toHaveLength(1)
  })

  it('pierwszy przebieg przy już podniesionym poziomie powiadamia', () => {
    const { raised } = diffThreatForPush(null, state({ podkarpackie: 'high' }), T0)
    expect(raised.map(r => r.id)).toEqual(['podkarpackie'])
  })

  it('liczy województwa niezależnie od siebie', () => {
    const prev = { lubelskie: { level: 'high', ts: T0 } }
    const { raised } = diffThreatForPush(
      prev,
      state({ lubelskie: 'high', podkarpackie: 'elevated', mazowieckie: 'watch' }),
      T0 + 60_000
    )
    expect(raised.map(r => r.id)).toEqual(['podkarpackie'])
  })

  it('próg jest tam, gdzie go zadeklarowano', () => {
    expect(PUSH_MIN_LEVEL).toBe('elevated')
  })
})

describe('regionIdAt', () => {
  it('rozpoznaje miasta w modelowanych województwach', () => {
    expect(regionIdAt(51.25, 22.57)).toBe('lubelskie')        // Lublin
    expect(regionIdAt(50.04, 21.99)).toBe('podkarpackie')     // Rzeszów
    expect(regionIdAt(52.23, 21.01)).toBe('mazowieckie')      // Warszawa
    expect(regionIdAt(53.13, 23.16)).toBe('podlaskie')        // Białystok
    expect(regionIdAt(50.06, 19.94)).toBe('malopolskie')      // Kraków
    expect(regionIdAt(53.78, 20.49)).toBe('warminsko-mazurskie') // Olsztyn
  })

  it('zwraca null poza modelowanym obszarem', () => {
    expect(regionIdAt(51.11, 17.03)).toBeNull()   // Wrocław
    expect(regionIdAt(54.35, 18.65)).toBeNull()   // Gdańsk
    expect(regionIdAt(50.45, 30.52)).toBeNull()   // Kijów
    expect(regionIdAt(null, 21.0)).toBeNull()
  })
})

describe('threatText', () => {
  const region = (id, level, score) => ({ id, name: id, level, score, reasons: ['alarm w obwodzie lwowskim (granica)'] })

  it('pusta lista nie produkuje powiadomienia', () => {
    expect(threatText([])).toBeNull()
    expect(threatText(null)).toBeNull()
  })

  it('jedno województwo trafia do tytułu razem z poziomem', () => {
    const { title, body } = threatText([region('lubelskie', 'high', 80)])
    expect(title).toContain('lubelskie')
    expect(title).toContain('wysokie')
    expect(body).toContain('alarm w obwodzie lwowskim')
  })

  it('przy kilku województwach tytuł niesie najgorszy poziom', () => {
    const { title, body } = threatText([
      region('podkarpackie', 'elevated', 50),
      region('lubelskie', 'high', 80),
    ])
    expect(title).toContain('wysokie')
    expect(title).toContain('2 województwa')
    expect(body).toContain('lubelskie (wysokie)')
    expect(body).toContain('podkarpackie (podwyższone)')
  })

  it('zastrzeżenie o RCB jedzie w każdej treści', () => {
    expect(threatText([region('lubelskie', 'high', 80)]).body).toMatch(/nie komunikat RCB/)
  })
})
