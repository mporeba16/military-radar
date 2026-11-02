import { describe, it, expect, vi, beforeEach } from 'vitest'

// Ślady bez wpisu w indeksie (nic się nie dopisało od 4 h) znikają co godzinę.
const stores = new Map()
const store = name => {
  if (!stores.has(name)) stores.set(name, new Map())
  const m = stores.get(name)
  return {
    get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, v) },
    delete: async (k) => { m.delete(k) },
    list: async () => ({ blobs: [...m.keys()].map(key => ({ key })) }),
  }
}
vi.mock('@netlify/blobs', () => ({ getStore: n => store(typeof n === 'string' ? n : n.name), connectLambda: () => {} }))

const H = 3600_000

describe('sprzątanie śladów', () => {
  beforeEach(() => stores.clear())

  it('kasuje ślady spoza indeksu, zostawia aktywne', async () => {
    const now = Date.now()
    for (const hex of ['aaa001', 'aaa002', 'aaa003']) store('aircraft-trails').set(hex, '{"points":[]}')
    store('aircraft-trails-index').set('book', JSON.stringify({ entries: {
      aaa001: { at: now - H },
      aaa002: { at: now - 5 * H }, // starszy niż 4 h — już nieaktywny
    } }))
    const { purgeStaleTrails } = await import('../netlify/functions/lib/collectJob.js')
    expect(await purgeStaleTrails(now)).toBe(2)
    expect([...stores.get('aircraft-trails').keys()]).toEqual(['aaa001'])
  })

  it('pusty indeks (świeżo po wdrożeniu) — nie kasuje niczego', async () => {
    store('aircraft-trails').set('aaa001', '{"points":[]}')
    const { purgeStaleTrails } = await import('../netlify/functions/lib/collectJob.js')
    expect(await purgeStaleTrails(Date.now())).toBe(0)
    expect(stores.get('aircraft-trails').size).toBe(1)
  })

  it('zapis śladu dopisuje maszynę do indeksu', async () => {
    const { saveTrails } = await import('../netlify/functions/aircraft.js')
    await saveTrails([{ hex: 'bbb001', flight: 'X', lat: 50, lon: 20, alt_baro: 10000 }])
    const idx = JSON.parse(stores.get('aircraft-trails-index').get('book'))
    expect(Object.keys(idx.entries)).toEqual(['bbb001'])
  })

  it('sprzątanie raz na godzinę, w pół godziny', async () => {
    const { isPurgeRun } = await import('../netlify/functions/lib/collectJob.js')
    expect(isPurgeRun(Date.UTC(2026, 10, 2, 12, 30, 30))).toBe(true)
    expect(isPurgeRun(Date.UTC(2026, 10, 2, 12, 0, 30))).toBe(false)
    expect(isPurgeRun(Date.UTC(2026, 10, 2, 12, 34, 0))).toBe(false)
  })
})
