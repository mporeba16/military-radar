import { describe, it, expect } from 'vitest'
import { scorePhotoMatch, photoHasMatchSignal, typeSlugCandidates, canVerifyPhotoMatch } from '../src/lib/photoMatch.js'

const photo = (link, src = 'hex') => ({ link, _src: src })

describe('typeSlugCandidates', () => {
  it('expands airliner ICAO codes to marketing slugs', () => {
    expect(typeSlugCandidates('B738')).toContain('737-800')
  })
  it('keeps raw + dashed forms for unique codes (F16 → f-16)', () => {
    const c = typeSlugCandidates('F16')
    expect(c).toContain('f-16')
  })
  it('returns [] for empty type', () => {
    expect(typeSlugCandidates('')).toEqual([])
  })
})

describe('scorePhotoMatch', () => {
  it('rewards a slug that mentions the aircraft type', () => {
    const ac = { t: 'F16', flight: 'PLF01' }
    const hit = scorePhotoMatch(photo('https://www.planespotters.net/photo/1/018-polish-air-force-f-16'), ac)
    const miss = scorePhotoMatch(photo('https://www.planespotters.net/photo/2/some-random-cessna'), ac)
    expect(hit).toBeGreaterThan(miss)
  })

  it('reg-sourced photo outranks hex-sourced when type/operator are equal', () => {
    const ac = { t: 'C295', flight: 'PLF038' }
    const reg = scorePhotoMatch(photo('https://www.planespotters.net/photo/1/018-c-295', 'reg'), ac)
    const hex = scorePhotoMatch(photo('https://www.planespotters.net/photo/2/018-c-295', 'hex'), ac)
    expect(reg).toBeGreaterThan(hex)
  })

  it('a type-matching hex photo still beats a non-matching reg photo', () => {
    // reg 018 collides: Polish C-295 vs Hellenic F-16. Type match must dominate.
    const ac = { t: 'C295', flight: 'PLF038' }
    const hexC295 = scorePhotoMatch(photo('https://www.planespotters.net/photo/1/018-c-295', 'hex'), ac)
    const regF16 = scorePhotoMatch(photo('https://www.planespotters.net/photo/2/018-hellenic-air-force-f-16', 'reg'), ac)
    expect(hexC295).toBeGreaterThan(regF16)
  })

  it('returns 0 when the photo has no link', () => {
    expect(scorePhotoMatch({ link: '' }, { t: 'F16' })).toBe(0)
  })
})

describe('photoHasMatchSignal', () => {
  it('true when the slug carries the type', () => {
    expect(photoHasMatchSignal(photo('https://x/photo/1/018-c-295'), { t: 'C295', flight: 'PLF038' })).toBe(true)
  })
  it('true when the slug carries the operator hint', () => {
    expect(photoHasMatchSignal(photo('https://x/photo/1/018-polish-air-force-xyz'), { t: 'ZZZZ', flight: 'PLF01' })).toBe(true)
  })
  it('false when nothing identifies the airframe (reg bonus alone is not a signal)', () => {
    expect(photoHasMatchSignal(photo('https://x/photo/1/605-unknown', 'reg'), { t: 'ZZZZ', flight: 'XXXX01' })).toBe(false)
  })
})

// Dwa realne przypadki z produkcji, oba z tego samego dnia.
describe('cudze zdjęcie kontra brak zdjęcia', () => {
  const a321Luftwaffe = { link: 'https://www.planespotters.net/photo/1973085/15-10-luftwaffe-german-air-force-airbus-a321-251nx' }
  const ec135Lpr = { link: 'https://www.planespotters.net/photo/1897798/sp-hxm-lpr-polish-medical-air-rescue-eurocopter-ec135-p3' }

  it('polski Hercules nie dostaje zdjęcia niemieckiego Airbusa', () => {
    // HEREC01 ma rejestrację 1510; planespotters rozwija ją na niemiecki numer
    // 15+10 i zwraca JEDNO zdjęcie — A321 Luftwaffe. Jedno trafienie nie znaczy
    // trafne, więc karta ma zostać bez zdjęcia.
    const herec = { t: 'C130', flight: 'HEREC01' }
    expect(canVerifyPhotoMatch(herec)).toBe(true)
    expect(photoHasMatchSignal(a321Luftwaffe, herec)).toBe(false)
  })

  it('śmigłowiec pogotowia dostaje swoje zdjęcie', () => {
    // adsb.fi podaje desygnator ICAO EC35, a slug zawiera nazwę handlową
    // ec135 — bez aliasu poprawne zdjęcie było odrzucane razem ze złymi.
    const lpr = { t: 'EC35', flight: 'LPR13' }
    expect(canVerifyPhotoMatch(lpr)).toBe(true)
    expect(photoHasMatchSignal(ec135Lpr, lpr)).toBe(true)
  })

  it('desygnatory ICAO śmigłowców trafiają w nazwy handlowe', () => {
    expect(typeSlugCandidates('EC35')).toContain('ec135')
    expect(typeSlugCandidates('EC45')).toContain('ec145')
    expect(typeSlugCandidates('A139')).toContain('aw139')
  })

  it('bez typu i bez rozpoznanego operatora nie ma czym weryfikować', () => {
    // Wtedy brak sygnału nic nie znaczy i nie wolno na tej podstawie odrzucać —
    // inaczej zgubilibyśmy poprawne zdjęcia maszyn bez kodu typu.
    expect(canVerifyPhotoMatch({ t: '', flight: 'XYZ99' })).toBe(false)
    expect(canVerifyPhotoMatch({ t: null, flight: '' })).toBe(false)
  })
})
