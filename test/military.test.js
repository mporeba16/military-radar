import { describe, it, expect } from 'vitest'
import {
  classifyADSBfi,
  isSuspiciousHex,
  isMilitaryADSBfiRecord,
  classifyExtra,
  isMilitaryState,
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
