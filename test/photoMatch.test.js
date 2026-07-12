import { describe, it, expect } from 'vitest'
import { scorePhotoMatch, photoHasMatchSignal, typeSlugCandidates } from '../src/lib/photoMatch.js'

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
