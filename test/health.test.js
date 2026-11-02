import { describe, it, expect } from 'vitest'
import { detectProblems, nextHealth } from '../netlify/functions/lib/health.js'

const MIN = 60_000
const NOW = 1_000_000_000_000
const ok = { parts: ['collect OK', 'inbound n=0', 'notify OK'], milOk: true, geoOk: true, workerAt: NOW - 3 * MIN }

describe('detectProblems', () => {
  it('zdrowy przebieg — brak problemów', () => {
    expect(detectProblems(ok, NOW)).toEqual({})
  })

  it('błąd zadania, padłe źródło, stojący Worker', () => {
    const p = detectProblems({
      parts: ['collect ERROR blobs', 'inbound n=0', 'notify OK'],
      milOk: true, geoOk: false, workerAt: NOW - 45 * MIN,
    }, NOW)
    expect(p.tick).toMatch(/collect ERROR blobs/)
    expect(p.sources).toBe('ruch nad Polską')
    expect(p.worker).toBe('ostatnia 45 min temu')
  })

  it('brak migawki z Cloudflare to też awaria', () => {
    expect(detectProblems({ ...ok, workerAt: null }, NOW).worker).toBe('brak migawki')
  })
})

describe('nextHealth', () => {
  it('pojedynczy błąd ticka nie alarmuje; trzeci z rzędu tak, raz', () => {
    let state = {}
    const run = (t) => nextHealth(state, { tick: 'collect ERROR x' }, t)
    let r = run(NOW); state = r.state
    expect(r.messages).toEqual([])
    r = run(NOW + 2 * MIN); state = r.state
    expect(r.messages).toEqual([])
    r = run(NOW + 4 * MIN); state = r.state
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0].body).toMatch(/^Od 4 min: collect ERROR x/)
    r = run(NOW + 6 * MIN); state = r.state
    expect(r.messages).toEqual([])
  })

  it('stojący Worker alarmuje od razu, przypomina po 6 h, a po naprawie — „działa znowu"', () => {
    let r = nextHealth({}, { worker: 'brak migawki' }, NOW)
    expect(r.messages.map(m => m.id)).toEqual(['worker'])
    r = nextHealth(r.state, { worker: 'brak migawki' }, NOW + 3 * 60 * MIN)
    expect(r.messages).toEqual([])
    r = nextHealth(r.state, { worker: 'brak migawki' }, NOW + 6 * 60 * MIN)
    expect(r.messages).toHaveLength(1)
    r = nextHealth(r.state, {}, NOW + 7 * 60 * MIN)
    expect(r.messages[0].title).toMatch(/działa znowu/)
    expect(r.state).toEqual({})
  })

  it('problem, który minął przed alarmem, nie wysyła niczego', () => {
    const r1 = nextHealth({}, { sources: 'listy /mil' }, NOW)
    const r2 = nextHealth(r1.state, {}, NOW + 2 * MIN)
    expect([...r1.messages, ...r2.messages]).toEqual([])
    expect(r2.state).toEqual({})
  })

  it('w ciszy nocnej czeka — alarm idzie w pierwszym przebiegu po 6:00', () => {
    const night = nextHealth({}, { worker: 'brak migawki' }, NOW, true)
    expect(night.messages).toEqual([])
    const morning = nextHealth(night.state, { worker: 'brak migawki' }, NOW + 60 * MIN, false)
    expect(morning.messages[0].body).toMatch(/^Od 60 min/)
  })
})
