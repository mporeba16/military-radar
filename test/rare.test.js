import { describe, it, expect } from 'vitest'
import { rareRole, rareRoleFor } from '../src/lib/rareTypes.js'
import { rareText, rareGroupText } from '../src/lib/notifyText.js'
import { findRare } from '../netlify/functions/notify.js'
import { normalizeKinds } from '../netlify/functions/lib/military.js'

describe('rareRole', () => {
  it('recognises tankers, AWACS, recon, drones', () => {
    expect(rareRole('K35R')).toBe('Tankowiec')
    expect(rareRole('e3tf')).toBe('Wczesne ostrzeganie (AWACS)')
    expect(rareRole('R135')).toBe('Rozpoznanie')
    expect(rareRole('Q4')).toBe('Dron rozpoznawczy')
    expect(rareRole('ANKA')).toBe('Dron rozpoznawczy')
    expect(rareRole('DRON')).toBe('Dron')
  })

  it('ignores everyday military traffic (myśliwce od 19.10.2026 to „Myśliwiec”)', () => {
    expect(rareRole('F16')).toBe('Myśliwiec')
    expect(rareRole('C130')).toBeNull()
    expect(rareRole('')).toBeNull()
  })
})

describe('findRare', () => {
  it('keeps airborne rare aircraft over Poland only', () => {
    const found = findRare([
      { hex: 'a', t: 'K35R', lat: 52.2, lon: 19.5, alt_baro: 30000 },   // nad Polską
      { hex: 'b', t: 'K35R', lat: 50.1, lon: 8.6, alt_baro: 30000 },    // Frankfurt
      { hex: 'c', t: 'C130', lat: 52.2, lon: 19.5, alt_baro: 20000 },   // nie rzadki
      { hex: 'd', t: 'E3TF', lat: 52.2, lon: 19.5, alt_baro: 'ground' },
    ])
    expect(found.map(f => f.ac.hex)).toEqual(['a'])
    expect(found[0].role).toBe('Tankowiec')
  })
})

describe('rare push text', () => {
  const ac = { hex: 'ae1234', flight: 'QID71 ', t: 'K35R', alt_baro: 28000, track: 90 }
  it('puts the role and region in the title', () => {
    const { title, body } = rareText(ac, 'Tankowiec', 'Łask')
    expect(title).toBe('Tankowiec · okolice Łask')
    expect(body).toMatch(/^Stratotanker · /)
    expect(body).toContain('8534 m')
  })

  it('groups several', () => {
    const { title } = rareGroupText([{ ac, role: 'Tankowiec' }, { ac, role: 'Rozpoznanie' }, { ac, role: 'Bombowiec' }])
    expect(title).toBe('3 rzadkie maszyny nad Polską')
  })
})

describe('kinds', () => {
  it('treats a missing rare flag as on, so old subscriptions get it', () => {
    expect(normalizeKinds({ mil: true, heli: false, heavy: true }).rare).toBe(true)
    expect(normalizeKinds({ rare: false }).rare).toBe(false)
  })
})

describe('rareRoleFor — rola z całego rekordu', async () => {
  const { rareRoleFor } = await import('../src/lib/rareTypes.js')
  const { findRare } = await import('../netlify/functions/notify.js')

  it('BRIO66 (ARTEMIS, CL60) to rozpoznanie — po hexie i po znaku', () => {
    expect(rareRoleFor({ hex: 'a0ec98', flight: 'BRIO66  ', t: 'CL60' })).toBe('Rozpoznanie (ARTEMIS)')
    expect(rareRoleFor({ hex: 'a0ffff', flight: 'BRIO12', t: 'CL60' })).toBe('Rozpoznanie (ARTEMIS)')
  })

  it('zwykły Challenger nie jest rzadką maszyną, tankowiec dalej po typie', () => {
    expect(rareRoleFor({ hex: 'a12345', flight: 'N600XX', t: 'CL60' })).toBeNull()
    expect(rareRoleFor({ hex: 'ae0001', flight: 'LAGR11', t: 'K35R' })).toBe('Tankowiec')
  })

  it('nad Polską trafia do alertów jak tankowiec', () => {
    const brio = { hex: 'a0ec98', flight: 'BRIO66', t: 'CL60', lat: 52.2, lon: 21.0, alt_baro: 31000 }
    expect(findRare([brio]).map(r => r.role)).toEqual(['Rozpoznanie (ARTEMIS)'])
  })
})

describe('myśliwce nad Polską alarmują jak tankowce', async () => {
  const { rareRoleFor } = await import('../src/lib/rareTypes.js')
  const { findRare } = await import('../netlify/functions/notify.js')

  it('F-16, F-35, Rafale, Gripen, Eurofighter — rola „Myśliwiec”', () => {
    for (const t of ['F16', 'F35', 'RFAL', 'JS39', 'EUFI', 'F15E', 'FA18'])
      expect(rareRoleFor({ hex: 'ae0001', t }), t).toBe('Myśliwiec')
  })

  it('trenażery i transportowce nie', () => {
    for (const t of ['M346', 'HAWK', 'L39', 'C17', 'C30J']) expect(rareRoleFor({ hex: 'ae0001', t }), t).toBeNull()
  })

  it('niemiecki Eurofighter bez typu w ADS-B (GAFS73D) rozpoznany z wpisu ręcznego', () => {
    const gaf = { hex: '3eacaf', flight: 'GAFS73D', t: '', lat: 52.27, lon: 16.78, alt_baro: 18425 }
    expect(findRare([gaf]).map(r => r.role)).toEqual(['Myśliwiec'])
  })
})

describe('rola po opisie z bazy (cywilny kod typu)', () => {
  it('KC-767A (B762) to tankowiec, Shadow R1 (B350) to rozpoznanie', () => {
    expect(rareRoleFor({ hex: '33ff01', flight: 'BREUS56', t: 'B762', desc: 'Boeing KC-767A' })).toBe('Tankowiec')
    expect(rareRoleFor({ hex: '43c001', flight: 'RFR7141', t: 'B350', desc: 'Beech Shadow R1+' })).toBe('Rozpoznanie')
  })
  it('zwykły King Air czy 767 bez opisu wojskowego nie jest rzadki', () => {
    expect(rareRoleFor({ hex: '43c002', t: 'B350', desc: 'BEECHCRAFT Super King Air 350' })).toBeNull()
    expect(rareRoleFor({ hex: '43c003', t: 'B762', desc: 'BOEING 767-200' })).toBeNull()
    expect(rareRoleFor({ hex: '43c004', t: 'B762' })).toBeNull()
  })
})
