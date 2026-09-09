import { describe, it, expect } from 'vitest'
import { alertText, groupText, shortTypeName, flightLevel, compassDir } from '../src/lib/notifyText.js'

const herc = { hex: 'ae1234', flight: 'KJD202 ', t: 'C130', alt_baro: 22000, track: 225, kind: 'mil' }
const bryza = { hex: '485849', flight: 'PLF283A', t: 'AN28', alt_baro: 3300, track: 352, kind: 'mil' }
const heli = { hex: '48d001', flight: 'LPR11', t: 'EC35', alt_baro: 1200, track: 135, kind: 'heli' }
const ruslan = { hex: '508035', flight: 'ADB3467', t: 'A124', alt_baro: 31000, track: 270, kind: 'heavy' }

describe('flightLevel', () => {
  it('dopełnia do trzech cyfr', () => {
    expect(flightLevel(3300)).toBe('FL033')
    expect(flightLevel(22000)).toBe('FL220')
  })
  it('brak wysokości nie daje poziomu lotu', () => {
    expect(flightLevel(null)).toBe(null)
  })
})

describe('compassDir', () => {
  it('zamienia kurs na róże ośmiu kierunków', () => {
    expect(compassDir(0)).toBe('N')
    expect(compassDir(225)).toBe('SW')
    expect(compassDir(352)).toBe('N')
  })
  it('brak kursu zwraca null', () => {
    expect(compassDir(null)).toBe(null)
  })
})

describe('shortTypeName', () => {
  it('podmienia kod ICAO na nazwę własną', () => {
    expect(shortTypeName(herc)).toBe('Hercules')
  })
  it('tnie nazwę z ukośnikiem do pierwszego członu', () => {
    expect(shortTypeName(bryza)).toBe('M28 Bryza')
  })
  it('bez nazwy własnej zostaje kod', () => {
    expect(shortTypeName(heli)).toBe('EC35')
  })
  it('brak typu nie daje nazwy', () => {
    expect(shortTypeName({ hex: 'abc' })).toBe(null)
  })
})

describe('alertText — pojedyncza maszyna', () => {
  it('wojskowy w zasięgu ma dystans w tytule', () => {
    const { title, body } = alertText(herc, 48)
    expect(title).toBe('Wojskowy Hercules · 48 km')
    expect(body).toBe('KJD202 · C130 · FL220 · kurs SW')
  })

  it('poniżej 10 km tytuł zaczyna się od słowa pilności', () => {
    const { title, body } = alertText(bryza, 8)
    expect(title).toBe('Blisko · M28 Bryza · 8 km')
    expect(body).toBe('PLF283A · AN28 · FL033 · kurs N')
  })

  it('duży samolot prowadzi nazwą własną, bo po to się wychodzi z domu', () => {
    expect(alertText(ruslan, 44).title).toBe('An-124 Rusłan · 44 km')
  })

  it('śmigłowiec zostaje przy ogólnej kategorii, typ schodzi do treści', () => {
    const { title, body } = alertText(heli, 21)
    expect(title).toBe('Śmigłowiec służbowy · 21 km')
    expect(body).toBe('LPR11 · EC35 · FL012 · kurs SE')
  })

  it('bez nazwy własnej kod nie dubluje się w tytule i treści', () => {
    const ac = { hex: 'ae9999', flight: 'RCH123', t: 'ZZZZ', alt_baro: 30000, track: 90, kind: 'mil' }
    const { title, body } = alertText(ac, 60)
    expect(title).toBe('Wojskowy ZZZZ · 60 km')
    expect(body).toBe('RCH123 · FL300 · kurs E')
  })

  it('bez typu i bez callsignu zostaje sam heks', () => {
    const { title, body } = alertText({ hex: 'ae0001', kind: 'mil' }, 33)
    expect(title).toBe('Wojskowy samolot · 33 km')
    expect(body).toBe('ae0001')
  })

  it('żaden tytuł nie kończy się wykrzyknikiem', () => {
    for (const [ac, d] of [[herc, 48], [bryza, 8], [heli, 21], [ruslan, 44]]) {
      expect(alertText(ac, d).title).not.toContain('!')
    }
  })

  it('treść używa jednego separatora, bez nawiasów i myślnika', () => {
    const { body } = alertText(herc, 48)
    expect(body).not.toMatch(/[(—),]/)
  })
})

describe('groupText — kilka maszyn', () => {
  const list = [
    { ...herc, _dist: 36 },
    { ...heli, _dist: 41, kind: 'mil' },
    { ...ruslan, _dist: 55, kind: 'mil' },
  ]

  it('dystans najbliższej trafia do tytułu', () => {
    const { title, body } = groupText(list, 'mil')
    expect(title).toBe('3 wojskowe · od 36 km')
    expect(body).toBe('KJD202 C130 · LPR11 EC35 · ADB3467 A124')
  })

  it('sortuje po dystansie niezależnie od kolejności wejściowej', () => {
    const shuffled = [list[2], list[0], list[1]]
    expect(groupText(shuffled, 'mil').title).toBe('3 wojskowe · od 36 km')
  })

  it('powyżej pięciu maszyn dokłada licznik nadmiaru', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      hex: `ae000${i}`, flight: `MIL${i}`, t: 'C130', _dist: 20 + i, kind: 'mil',
    }))
    const { title, body } = groupText(many, 'mil')
    expect(title).toBe('8 wojskowych · od 20 km')
    expect(body).toMatch(/\+3$/)
    expect(body.split(' · ')).toHaveLength(5)
  })

  it('grupa poniżej 10 km dopisuje słowo pilności', () => {
    const close = [{ ...herc, _dist: 4 }, { ...bryza, _dist: 7 }, { ...herc, hex: 'ae5', _dist: 9 }, { ...bryza, hex: 'ae6', _dist: 9 }]
    expect(groupText(close, 'mil').title).toBe('4 wojskowe blisko · od 4 km')
  })

  it('kategorie inne niż wojsko zachowują rzeczownik', () => {
    const heavies = [{ ...ruslan, _dist: 44 }, { ...ruslan, hex: 'x', _dist: 60 }]
    expect(groupText(heavies, 'heavy').title).toBe('2 duże samoloty · od 44 km')
    const helis = [{ ...heli, _dist: 12 }, { ...heli, hex: 'y', _dist: 30 }]
    expect(groupText(helis, 'heli').title).toBe('2 śmigłowce służbowe · od 12 km')
  })
})
