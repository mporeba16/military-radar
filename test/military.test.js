import { describe, it, expect } from 'vitest'
import {
  classifyADSBfi,
  isSuspiciousHex,
  isTrainingAircraft,
  isMilitaryADSBfiRecord,
  classifyExtra,
  isMilitaryState,
  normalizeKinds,
} from '../netlify/functions/lib/military.js'

describe('classifyADSBfi', () => {
  it('tags a military callsign as mil', () => {
    expect(classifyADSBfi({ hex: '3f1234', flight: 'PLF01', t: 'C295' })).toBe('mil')
  })

  it('tags the US military hex block (ae*) as mil', () => {
    expect(classifyADSBfi({ hex: 'ae1234', flight: 'ANON', t: '' })).toBe('mil')
  })

  it('excludes civilian airlines even if they look interesting', () => {
    expect(classifyADSBfi({ hex: '48abcd', flight: 'LOT123', t: 'B738' })).toBe(null)
    expect(classifyADSBfi({ hex: '48abcd', flight: 'RYR9AB', t: 'B738' })).toBe(null)
  })

  it('excludes ground stations (XCAM)', () => {
    expect(classifyADSBfi({ hex: '3f1234', flight: '7777XCAM', squawk: '7777' })).toBe(null)
  })

  it('tags military squawk 7777 as mil', () => {
    expect(classifyADSBfi({ hex: '3f1234', flight: 'ANON', squawk: '7777' })).toBe('mil')
  })

  it('classifies a service helicopter (SP-HX reg + rotorcraft type) as heli', () => {
    expect(classifyADSBfi({ hex: '48abcd', flight: 'RATOWNIK1', t: 'EC35', r: 'SP-HXA' })).toBe('heli')
  })

  it('classifies a B747 as heavy', () => {
    expect(classifyADSBfi({ hex: '48abcd', flight: 'GEC1', t: 'B744' })).toBe('heavy')
  })

  it('classifies Antonov Airlines by callsign even without a type', () => {
    expect(classifyADSBfi({ hex: '508abc', flight: 'ADB1234', t: '' })).toBe('heavy')
  })

  it('military wins over extra categories (mil B747 stays mil)', () => {
    expect(classifyADSBfi({ hex: 'ae9999', flight: 'RCH123', t: 'B744' })).toBe('mil')
  })
})

describe('isSuspiciousHex', () => {
  it('flags all-identical bytes (0xAAAAAA)', () => {
    expect(isSuspiciousHex('aaaaaa')).toBe(true)
  })
  it('flags arithmetic-sequence bytes (0x445566)', () => {
    expect(isSuspiciousHex('445566')).toBe(true)
  })
  it('flags TIS-B synthetic addresses ending in FFF', () => {
    expect(isSuspiciousHex('c2bfff')).toBe(true)
  })
  it('flags zero / unparseable', () => {
    expect(isSuspiciousHex('000000')).toBe(true)
    expect(isSuspiciousHex('zzzzzz')).toBe(true)
  })
  it('flags block-boundary addresses ending in 000', () => {
    // 480000 = początek puli holenderskiej. Tym adresem przyszedł do nas
    // „SPOTR": MLAT-owy znak wywoławczy doklejony do adresu domyślnego, a baza
    // adsb.fi mapuje go na cywilnego Fokkera 70 i oznacza jako wojskowy.
    expect(isSuspiciousHex('480000')).toBe(true)
    expect(isSuspiciousHex('3c0000')).toBe(true)
    expect(isSuspiciousHex('484000')).toBe(true)
  })
  it('accepts real addresses seen in the live military feed', () => {
    // Kontrola, że reguła 000 nie zabiera prawdziwych maszyn — to hexy
    // zaobserwowane w /mil (C-17, KC-135, AT-802).
    for (const hex of ['ae144e', 'ae0137', 'af37c4', '48c0d1', '4b1234']) {
      expect(isSuspiciousHex(hex)).toBe(false)
    }
  })
  it('accepts a normal ICAO address', () => {
    expect(isSuspiciousHex('3c6444')).toBe(false)
  })
})

describe('isMilitaryADSBfiRecord', () => {
  it('true for a military callsign', () => {
    expect(isMilitaryADSBfiRecord({ hex: '3f1234', flight: 'GAF123' })).toBe(true)
  })
  it('false for a civilian callsign', () => {
    expect(isMilitaryADSBfiRecord({ hex: '3f1234', flight: 'DLH4AB' })).toBe(false)
  })
})

describe('classifyExtra', () => {
  it('null for a plain airliner', () => {
    expect(classifyExtra({ t: 'A320', flight: 'LOT1', r: 'SP-LVA' })).toBe(null)
  })
  it('does not classify a non-rotorcraft SN- reg as heli', () => {
    // SN- prefix is service, but only counts when the type is a rotorcraft.
    expect(classifyExtra({ t: 'C208', flight: 'ANON', r: 'SN-123' })).toBe(null)
  })
})

describe('isMilitaryState (OpenSky array form)', () => {
  it('true for a military callsign in the state vector', () => {
    const s = []; s[0] = '3f1234'; s[1] = 'RCH01  '; s[14] = null
    expect(isMilitaryState(s)).toBe(true)
  })
  it('false for a civilian callsign', () => {
    const s = []; s[0] = '48abcd'; s[1] = 'WZZ123 '; s[14] = null
    expect(isMilitaryState(s)).toBe(false)
  })
})

// Filtr kategorii jest wspólny dla mapy i powiadomień, więc rekord zapisany
// starszym klientem (bez pola `kinds`) nie może nikomu wyciszyć alertów.
describe('normalizeKinds', () => {
  it('brak pola oznacza wszystkie kategorie włączone', () => {
    expect(normalizeKinds(undefined)).toEqual({ mil: true, heli: true, heavy: true, rare: true })
    expect(normalizeKinds(null)).toEqual({ mil: true, heli: true, heavy: true, rare: true })
  })

  it('wartość niebędąca obiektem też oznacza komplet', () => {
    expect(normalizeKinds('wszystko')).toEqual({ mil: true, heli: true, heavy: true, rare: true })
    expect(normalizeKinds(7)).toEqual({ mil: true, heli: true, heavy: true, rare: true })
  })

  it('wyłącza wyłącznie jawne false', () => {
    expect(normalizeKinds({ heavy: false }))
      .toEqual({ mil: true, heli: true, heavy: false, rare: true })
  })

  it('brakujący klucz zostaje włączony', () => {
    expect(normalizeKinds({ mil: false }))
      .toEqual({ mil: false, heli: true, heavy: true, rare: true })
  })

  it('ignoruje nieznane klucze i zwraca zawsze ten sam kształt', () => {
    expect(normalizeKinds({ mil: true, ufo: false }))
      .toEqual({ mil: true, heli: true, heavy: true, rare: true })
  })

  it('potrafi wyłączyć wszystko naraz', () => {
    expect(normalizeKinds({ mil: false, heli: false, heavy: false, rare: false }))
      .toEqual({ mil: false, heli: false, heavy: false, rare: false })
  })
})

describe('isTrainingAircraft', () => {
  it('odsiewa maszyny latające w kółko nad własnym lotniskiem', () => {
    // PZ3T to PZL-130 Orlik z Dęblina — potrafi siedzieć na mapie cały dzień,
    // robiąc kręgi nad Radomiem, i zapycha radar zdarzeniami bez znaczenia.
    expect(isTrainingAircraft('PZ3T')).toBe(true)
    expect(isTrainingAircraft('G115')).toBe(true)
    expect(isTrainingAircraft('PC21')).toBe(true)
    expect(isTrainingAircraft('DA40')).toBe(true)
  })

  it('odsiewa Texana, Hawka i TBM (zgłoszone przez użytkownika)', () => {
    for (const t of ['TEX2', 'HAWK', 'TBM7', 'TBM9', 'PC7', 'TUCA', 'G12T']) {
      expect(isTrainingAircraft(t), t).toBe(true)
    }
  })

  it('zostawia szkolno-bojowe, bo te latają zadaniowo', () => {
    for (const t of ['M346', 'TS11', 'L39', 'T38']) {
      expect(isTrainingAircraft(t), t).toBe(false)
    }
  })

  it('nie wywraca się na braku typu', () => {
    expect(isTrainingAircraft('')).toBe(false)
    expect(isTrainingAircraft(null)).toBe(false)
    expect(isTrainingAircraft(undefined)).toBe(false)
  })

  it('Orlik nie przechodzi klasyfikacji nawet z wojskowym callsignem', () => {
    // Bramka musi stać PRZED regułami hex/callsign, inaczej PLF na Orliku
    // przepuściłby go z powrotem na radar.
    expect(classifyADSBfi({ hex: '48d911', flight: 'PLF12', t: 'PZ3T' })).toBeNull()
  })
})

describe('znak wywoławczy = rejestracja', () => {
  it('SP-OOKY nadające „SPOOKY" nie jest wojskiem (zbieżność z AC-130)', () => {
    expect(isMilitaryADSBfiRecord({ hex: '48ea46', flight: 'SPOOKY  ', r: 'SP-OOKY', t: 'VL3' })).toBe(false)
  })
  it('polski SPxxxx z polskiej puli bez rejestracji w rekordzie też nie', () => {
    expect(isMilitaryADSBfiRecord({ hex: '48ea46', flight: 'SPOOKY', t: '' })).toBe(false)
    const state = ['48ea46', 'SPOOKY  ', 'Poland', 0, 0, 19, 50, 400, false, 60, 50, 0, null, 400, '7000']
    expect(isMilitaryState(state)).toBe(false)
  })
  it('obca rejestracja jako znak (D-EMON → DEMON) nie jest wojskiem', () => {
    expect(isMilitaryADSBfiRecord({ hex: '3c1234', flight: 'DEMON', r: 'D-EMON' })).toBe(false)
  })
  it('prawdziwy znak SPOOKY spoza polskiej puli dalej jest wojskiem', () => {
    expect(isMilitaryADSBfiRecord({ hex: '4b1234', flight: 'SPOOKY11', r: 'X-1' })).toBe(true)
  })
  it('squawk 7777 nadal działa przy znaku = rejestracja', () => {
    expect(isMilitaryADSBfiRecord({ hex: '48ea46', flight: 'SPOOKY', r: 'SP-OOKY', squawk: '7777' })).toBe(true)
  })
})

describe('flaga wojskowa z bazy (dbFlags)', () => {
  it('wojsko bez wojskowego znaku z flagą w bazie jest wojskiem', () => {
    expect(isMilitaryADSBfiRecord({ hex: '3b7567', flight: 'TTAL91', t: 'A332', dbFlags: 1 })).toBe(true)
    expect(isMilitaryADSBfiRecord({ hex: '33ffdc', flight: 'LYF275', t: 'C27J', dbFlags: 9 })).toBe(true)
  })
  it('inne bity (np. PIA/LADD) nie robią z maszyny wojska', () => {
    expect(isMilitaryADSBfiRecord({ hex: '3c1234', flight: 'DLH1', t: 'A320', dbFlags: 4 })).toBe(false)
  })
  it('szkoleniowy z flagą nadal odpada', () => {
    expect(isMilitaryADSBfiRecord({ hex: '498495', flight: 'CEF850', t: 'Z42', dbFlags: 1 })).toBe(false)
  })
})

describe('ukryte na prośbę użytkownika (20.10.2026)', () => {
  it('SF-260, MB-339, Bayraktar TB2 i Anka odpadają', () => {
    for (const t of ['F260', 'M339', 'BTB2', 'ANKA']) expect(isTrainingAircraft(t), t).toBe(true)
  })
})
