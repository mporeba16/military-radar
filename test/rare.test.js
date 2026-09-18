import { describe, it, expect } from 'vitest'
import { rareRole } from '../src/lib/rareTypes.js'
import { rareText, rareGroupText } from '../src/lib/notifyText.js'
import { findRare } from '../netlify/functions/notify.js'
import { normalizeKinds } from '../netlify/functions/lib/military.js'

describe('rareRole', () => {
  it('recognises tankers, AWACS, recon, drones', () => {
    expect(rareRole('K35R')).toBe('Tankowiec')
    expect(rareRole('e3tf')).toBe('Wczesne ostrzeganie (AWACS)')
    expect(rareRole('R135')).toBe('Rozpoznanie')
    expect(rareRole('Q4')).toBe('Dron rozpoznawczy')
  })

  it('ignores everyday military traffic', () => {
    expect(rareRole('F16')).toBeNull()
    expect(rareRole('C130')).toBeNull()
    expect(rareRole('')).toBeNull()
  })
})

describe('findRare', () => {
  it('keeps airborne rare aircraft over Poland only', () => {
    const found = findRare([
      { hex: 'a', t: 'K35R', lat: 52.2, lon: 19.5, alt_baro: 30000 },   // nad Polską
      { hex: 'b', t: 'K35R', lat: 50.1, lon: 8.6, alt_baro: 30000 },    // Frankfurt
      { hex: 'c', t: 'F16', lat: 52.2, lon: 19.5, alt_baro: 20000 },    // nie rzadki
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
    expect(body).toMatch(/^QID71 · /)
    expect(body).toContain('FL280')
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
