import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { KIND_COLORS, BASE_PL, BASE_NATO, RANGE, RANGE_LABEL, THREAT, ALERT } from '../src/lib/palette.js'

// Paleta żyje w dwóch miejscach: palette.js dla warstwy JS (Leaflet przyjmuje
// kolory jako wartości, nie zmienne CSS) i :root w index.css dla arkuszy.
// Wspólnego źródła nie ma bez narzędzia budującego, więc zgodności pilnuje ten
// test — inaczej po miesiącu kwadrat bazy i jego próbka w panelu miałyby dwa
// różne odcienie i nikt by nie wiedział, który jest właściwy.
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

function token(name) {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  return m ? m[1].toLowerCase() : null
}

describe('paleta', () => {
  it('tokeny CSS zgadzają się z paletą JS', () => {
    const pairs = [
      ['kind-mil', KIND_COLORS.mil],
      ['kind-heli', KIND_COLORS.heli],
      ['kind-heavy', KIND_COLORS.heavy],
      ['base-pl', BASE_PL],
      ['base-nato', BASE_NATO],
      ['range', RANGE],
      ['range-label', RANGE_LABEL],
      ['threat-calm', THREAT.calm],
      ['threat-watch', THREAT.watch],
      ['threat-elevated', THREAT.elevated],
      ['threat-high', THREAT.high],
      ['alert', ALERT],
    ]
    for (const [name, value] of pairs) {
      expect(token(name), `--${name}`).toBe(value.toLowerCase())
    }
  })

  it('osie nie dzielą się barwą', () => {
    // Sedno uporządkowania: ten sam kod szesnastkowy nie może znaczyć dwóch
    // różnych rzeczy. Wcześniej #ffb300 był naraz dużym samolotem, polską bazą
    // i poziomem obserwacji.
    const used = [
      ['mil', KIND_COLORS.mil], ['heli', KIND_COLORS.heli], ['heavy', KIND_COLORS.heavy],
      ['baza PL', BASE_PL], ['baza NATO', BASE_NATO], ['poligon', RANGE],
      ['watch', THREAT.watch], ['elevated', THREAT.elevated], ['high', THREAT.high],
    ]
    const seen = new Map()
    for (const [name, hex] of used) {
      const prev = seen.get(hex.toLowerCase())
      expect(prev, `${hex} użyty i przez „${prev}", i przez „${name}"`).toBeUndefined()
      seen.set(hex.toLowerCase(), name)
    }
  })

  it('jedna czerwień alarmowa', () => {
    expect(ALERT).toBe(THREAT.high)
  })

  it('infrastruktura jest przygaszona względem ruchu', () => {
    // Bazy i poligony to tło odniesienia; nie mogą mieć nasycenia żywej maszyny.
    const sat = hex => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      return max === 0 ? 0 : (max - min) / max
    }
    for (const infra of [BASE_PL, BASE_NATO, RANGE]) {
      expect(sat(infra), infra).toBeLessThan(sat(KIND_COLORS.heavy))
    }
  })
})
