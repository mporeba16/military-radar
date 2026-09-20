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

describe('rejestracja w adresie zdjęcia', () => {
  it('SHADOW2 odzyskuje swoje zdjęcie', () => {
    // Regresja po zaostrzeniu bramki: AN28 nie trafiał w slug „m-28b-pt",
    // więc poprawne zdjęcie polskiej Bryzy było odrzucane razem ze złymi.
    const foto = { link: 'https://www.planespotters.net/photo/1590895/0222-polish-air-force-pzl-mielec-m-28b-pt' }
    expect(photoHasMatchSignal(foto, { t: 'AN28', reg: '0222', flight: 'SHADOW2' })).toBe(true)
  })

  it('numer z myślnikiem nie udaje numeru bez myślnika', () => {
    // Polski Hercules 1510 kontra niemiecki Airbus 15+10 zapisany jako „15-10".
    // Gdyby porównanie normalizowało myślniki, cudze zdjęcie wróciłoby na kartę.
    const foto = { link: 'https://www.planespotters.net/photo/1973085/15-10-luftwaffe-german-air-force-airbus-a321-251nx' }
    expect(photoHasMatchSignal(foto, { t: 'C130', reg: '1510', flight: 'HEREC01' })).toBe(false)
  })

  it('goły numer seryjny nie jest dowodem tożsamości', () => {
    // Polski Mi-17 „630" (hex 48DA46, callsign 10630) dostawał na kartę zdjęcie
    // izraelskiej Fougi Magister — bo jej adres też zaczyna się od „630-".
    // planespotters nie ma tego płatowca ani pod hexem, ani pod rejestracją,
    // więc jedyną poprawną odpowiedzią jest „brak zdjęcia".
    const fouga = { link: 'https://www.planespotters.net/photo/734720/630-israeli-air-force-fouga-cm-170-magister' }
    const mi17 = { t: 'MI8', reg: '630', flight: '10630' }
    expect(photoHasMatchSignal(fouga, mi17)).toBe(false)

    // A gdyby planespotters kiedyś oddał właściwą maszynę — ma ją przyjąć,
    // mimo że kod typu mówi MI8, a adres Mi-17.
    const polski = { link: 'https://www.planespotters.net/photo/243536/605-polish-air-force-mil-mi-17' }
    expect(photoHasMatchSignal(polski, mi17)).toBe(true)
  })

  it('cywilny znak dalej rozstrzyga sam z siebie', () => {
    // Zaostrzenie dotyczy wyłącznie numerów seryjnych: znak z literą jest
    // globalnie unikalny i pierwszy człon adresu wciąż wystarcza za dowód.
    const foto = { link: 'https://www.planespotters.net/photo/1/sp-hxw-lpr-jakis-smiglowiec' }
    expect(photoHasMatchSignal(foto, { t: 'ZZZZ', reg: 'SP-HXW', flight: 'RATOWNIK21' })).toBe(true)
  })

  it('krótka rejestracja nie wystarcza za dowód', () => {
    const foto = { link: 'https://www.planespotters.net/photo/1/22-jakis-samolot' }
    expect(photoHasMatchSignal(foto, { t: 'XXXX', reg: '22', flight: 'TEST1' })).toBe(false)
  })
})

describe('King Air / C-12 (USAF SPAR)', () => {
  it('SPAR89 (BE20, 76-3239) przyjmuje swoje zdjęcie C-12C', () => {
    const foto = { link: 'https://www.planespotters.net/photo/1602941/76-3239-united-states-air-force-beechcraft-c-12c-b200-super-king-air?utm_source=api' }
    expect(photoHasMatchSignal(foto, { t: 'BE20', reg: '76-3239', flight: 'SPAR89' })).toBe(true)
  })
})

describe('military designators that differ from the slug', () => {
  it('accepts the KC-135 photo for K35R without a callsign (ae0596)', () => {
    const ac = { hex: 'ae0596', t: 'K35R', reg: '59-1460', flight: '' }
    const photo = {
      link: 'https://www.planespotters.net/photo/1963735/59-1460-united-states-air-force-boeing-kc-135t-stratotanker-717-148?utm_source=api',
      _src: 'reg',
    }
    expect(photoHasMatchSignal(photo, ac)).toBe(true)
  })

  it('still rejects an unrelated photo for the same numeric registration', () => {
    const ac = { hex: 'ae0596', t: 'K35R', reg: '59-1460', flight: '' }
    const photo = { link: 'https://www.planespotters.net/photo/1/59-1460-some-air-force-lockheed-f-104g-starfighter' }
    expect(photoHasMatchSignal(photo, ac)).toBe(false)
  })
})

describe('szwedzkie Saaby', () => {
  it('przyjmuje zdjęcie Tp 100 dla SF34 (SVF631)', () => {
    const ac = { hex: '4a81f4', t: 'SF34', reg: '100008', flight: 'SVF631' }
    const photo = { link: 'https://www.planespotters.net/photo/1/100008-swedish-air-force-saab-tp-100c-340b', _src: 'reg' }
    expect(photoHasMatchSignal(photo, ac)).toBe(true)
  })

  it('nie przyjmuje obcego płatowca o tym samym numerze', () => {
    const ac = { hex: '4a81f4', t: 'SF34', reg: '100008', flight: 'SVF631' }
    const photo = { link: 'https://www.planespotters.net/photo/2/100008-hellenic-air-force-lockheed-c-130h' }
    expect(photoHasMatchSignal(photo, ac)).toBe(false)
  })
})

describe('Learjet C-21', () => {
  it('przyjmuje zdjęcie C-21A dla LJ35 (E10E2)', () => {
    const ac = { hex: 'ae018a', t: 'LJ35', reg: '84-0096', flight: 'E10E2' }
    const photo = { link: 'https://www.planespotters.net/photo/1/84-0096-united-states-air-force-learjet-c-21a-learjet-35a', _src: 'reg' }
    expect(photoHasMatchSignal(photo, ac)).toBe(true)
  })
})
