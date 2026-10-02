import { describe, it, expect } from 'vitest'
import { filterMlatSpikes } from '../src/lib/trailFilter.js'

// MLAT nie był zapisywany w trasach, więc maszyny bez własnej pozycji (C-17,
// C-130J, A400M, E-3, śmigłowce) nie miały linii „skąd leci”. Teraz zapisujemy
// MLAT, a filtr usuwa tylko pojedyncze odskoki w bok.
const pt = (lat, lon, ts, m = 1) => ({ lat, lon, ts, ...(m ? { m: 1 } : {}) })
const EAST = 0.06 // ~4 km na wschód na 50°N, czyli ~30 s lotu przy 260 kt

describe('filterMlatSpikes', () => {
  it('zostawia równą trasę MLAT', () => {
    const line = [0, 1, 2, 3, 4].map(i => pt(50, 10 + i * EAST, i * 30_000))
    expect(filterMlatSpikes(line)).toEqual(line)
  })

  it('usuwa punkt MLAT odskakujący w bok i wracający', () => {
    const line = [pt(50, 10, 0), pt(50, 10 + EAST, 30_000), pt(50.12, 10 + 2 * EAST, 60_000), pt(50, 10 + 3 * EAST, 90_000), pt(50, 10 + 4 * EAST, 120_000)]
    const out = filterMlatSpikes(line)
    expect(out).toHaveLength(4)
    expect(out.some(p => p.lat === 50.12)).toBe(false)
  })

  it('nie rusza takiego samego odskoku z ADS-B (bez flagi m)', () => {
    const line = [pt(50, 10, 0, 0), pt(50.12, 10 + EAST, 30_000, 0), pt(50, 10 + 2 * EAST, 60_000, 0)]
    expect(filterMlatSpikes(line)).toHaveLength(3)
  })

  it('zostawia nawrót samolotu (zakręt o 180° w 60 s)', () => {
    // 4 km na wschód, potem 4 km z powrotem kawałek obok — to manewr, nie błąd
    const turn = [pt(50, 10 - 2 * EAST, -60_000), pt(50, 10 - EAST, -30_000), pt(50, 10, 0), pt(50.02, 10 + EAST, 30_000), pt(50.03, 10, 60_000), pt(50.03, 10 - EAST, 90_000)]
    expect(filterMlatSpikes(turn)).toHaveLength(6)
  })

  it('zawsze zostawia pierwszy i ostatni punkt', () => {
    const two = [pt(50, 10, 0), pt(51, 12, 30_000)]
    expect(filterMlatSpikes(two)).toEqual(two)
  })
})
