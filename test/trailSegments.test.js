import { describe, it, expect } from 'vitest'
import { buildTrailSegments } from '../src/lib/trailSegments.js'

const T0 = 1_000_000_000
const pt = (i, alt = 30000, dtMs = 60_000) => ({ lat: 50 + i * 0.1, lon: 20, alt, ts: T0 + i * dtMs })

describe('buildTrailSegments', () => {
  it('za mało punktów — nic do narysowania', () => {
    expect(buildTrailSegments('ae1', [pt(0)], [], null, T0)).toEqual({ segments: null, start: null })
  })

  it('jedna wysokość = jeden odcinek; start w najstarszym punkcie; bieżąca pozycja domyka linię', () => {
    const { segments, start } = buildTrailSegments('ae1', [pt(0), pt(1)], [pt(2)], { lat: 50.5, lon: 20, alt_baro: 30000 }, T0 + 3 * 60_000)
    expect(segments).toHaveLength(1)
    expect(segments[0].positions.map(p => p[0])).toEqual([50, 50.1, 50.2, 50.5])
    expect(start).toEqual({ lat: 50, lon: 20 })
  })

  it('zmiana koloru zostawia most, przerwa w danych — nie', () => {
    const climb = [pt(0, 500), pt(1, 500), pt(2, 30000), pt(3, 30000)]
    const { segments } = buildTrailSegments('ae1', climb, [], null, T0)
    expect(segments).toHaveLength(2)
    expect(segments[1].positions[0]).toEqual(segments[0].positions.at(-1))  // most

    const gap = [pt(0), pt(1), { ...pt(2), ts: T0 + 60_000 + 4 * 60_000 }, { ...pt(3), ts: T0 + 60_000 + 5 * 60_000 }]
    const cut = buildTrailSegments('ae1', gap, [], null, T0)
    expect(cut.segments).toHaveLength(2)
    expect(cut.segments[1].positions[0]).not.toEqual(cut.segments[0].positions.at(-1))  // bez mostu
  })

  it('punkty z serwera i aplikacji w tym samym miejscu i czasie liczą się raz', () => {
    const { segments } = buildTrailSegments('ae1', [pt(0), pt(1)], [{ ...pt(1), ts: pt(1).ts + 5_000 }], null, T0)
    expect(segments[0].positions).toHaveLength(2)
  })
})
