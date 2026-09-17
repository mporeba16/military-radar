import { describe, it, expect } from 'vitest'
import { MIL_RANGES_PL } from '../src/data/milRanges.js'
import { isInPoland } from '../netlify/functions/lib/poland.js'

// Dane wygenerowane z OSM i uproszczone skryptem — nikt ich nie przeczyta
// linijka po linijce, więc niech pilnuje ich test. Zszywanie otwartych
// fragmentów granicy w pierścienie to najbardziej zawodny krok generatora.
describe('MIL_RANGES_PL', () => {
  it('zawiera największe czynne poligony', () => {
    const names = MIL_RANGES_PL.map(r => r.name)
    for (const n of ['Drawsko', 'Orzysz', 'Toruń', 'Nowa Dęba', 'Biedrusko', 'Wędrzyn']) {
      expect(names).toContain(n)
    }
  })

  it('każdy pierścień jest domknięty', () => {
    for (const r of MIL_RANGES_PL) {
      for (const [i, ring] of r.rings.entries()) {
        expect(ring.length, `${r.name} płat ${i}`).toBeGreaterThan(3)
        expect(ring[0], `${r.name} płat ${i} — pierwszy i ostatni punkt`).toEqual(ring[ring.length - 1])
      }
    }
  })

  it('wszystkie punkty leżą w granicach Polski', () => {
    for (const r of MIL_RANGES_PL) {
      for (const ring of r.rings) {
        for (const [lat, lon] of ring) {
          expect(isInPoland(lat, lon), `${r.name}: ${lat},${lon}`).toBe(true)
        }
      }
    }
  })

  it('powierzchnia zgadza się z geometrią', () => {
    // Gdyby zszywanie pogubiło fragmenty, pole policzone z pierścieni
    // rozjechałoby się z zapisanym `km2`.
    for (const r of MIL_RANGES_PL) {
      const total = r.rings.reduce((sum, ring) => sum + areaKm2(ring), 0)
      expect(total, r.name).toBeGreaterThan(r.km2 * 0.85)
      expect(total, r.name).toBeLessThan(r.km2 * 1.15)
    }
  })

  it('poligony się nie dublują', () => {
    const names = MIL_RANGES_PL.map(r => r.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

function areaKm2(ring) {
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length
  const k = Math.cos(lat0 * Math.PI / 180)
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLon] = ring[i]
    const [bLat, bLon] = ring[(i + 1) % ring.length]
    s += (aLon * k * 111.32) * (bLat * 110.57) - (bLon * k * 111.32) * (aLat * 110.57)
  }
  return Math.abs(s) / 2
}
