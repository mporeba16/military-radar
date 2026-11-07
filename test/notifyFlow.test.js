import { describe, it, expect, vi, beforeEach } from 'vitest'

// Cały przebieg notify na podstawionych danych: Blobs w pamięci, push
// zapisywany zamiast wysyłany, źródła samolotów i pora dnia z testu.
const stores = new Map()
const store = name => {
  if (!stores.has(name)) stores.set(name, new Map())
  const m = stores.get(name)
  return {
    get: async (k, o) => (m.has(k) ? (o?.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, v) },
    delete: async k => { m.delete(k) },
    list: async () => ({ blobs: [...m.keys()].map(key => ({ key })) }),
  }
}
vi.mock('@netlify/blobs', () => ({ getStore: n => store(typeof n === 'string' ? n : n.name) }))

const sent = []
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub, payload) => { sent.push({ to: sub.endpoint, ...JSON.parse(payload) }) },
  },
}))

let sky = []
vi.mock('../netlify/functions/lib/sources.js', async importOriginal => ({
  ...(await importOriginal()),
  // Jak prawdziwa funkcja: tylko maszyny w promieniu od punktu — notify woła
  // ją osobno dla każdej subskrypcji.
  fetchMilitaryNear: async (lat, lon, radiusKm) => {
    const { haversine } = await import('../netlify/functions/lib/military.js')
    return sky.filter(a => haversine(lat, lon, a.lat, a.lon) <= radiusKm)
  },
  fetchMilGlobal: async () => sky,
}))
vi.mock('../netlify/functions/lib/quietHours.js', () => ({ isQuietHours: () => false }))

process.env.VAPID_PUBLIC_KEY = 'x'
process.env.VAPID_PRIVATE_KEY = 'y'

const sub = (key, lat, lon) => [key, JSON.stringify({
  subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${key}` },
  lat, lon, radius: 100, updatedAt: Date.now(), deviceId: key,
})]

describe('notify — jedno powiadomienie na samolot', () => {
  beforeEach(() => {
    stores.clear(); sent.length = 0
    const subs = store('push-subscriptions')
    // Kraków (tankowiec 40 km obok) i Gdańsk (ok. 480 km dalej).
    for (const [k, v] of [sub('krk', 50.06, 19.94), sub('gda', 54.35, 18.65)]) subs.set(k, v)
  })

  it('tankowiec w okręgu: Kraków dostaje tylko „w zasięgu” z rolą, Gdańsk — „nad Polską”', async () => {
    sky = [{ hex: 'ae1234', flight: 'LAGR11', t: 'K35R', kind: 'mil', lat: 50.3, lon: 20.3, alt_baro: 28000, track: 90 }]
    const { runNotify: notify } = await import('../netlify/functions/lib/notifyJob.js')
    await notify()
    const krk = sent.filter(p => p.to.endsWith('/krk'))
    const gda = sent.filter(p => p.to.endsWith('/gda'))
    expect(krk).toHaveLength(1)
    expect(krk[0].tag).toBe('ae1234')
    expect(krk[0].title).toMatch(/^Tankowiec · /)
    expect(gda).toHaveLength(1)
    expect(gda[0].tag).toBe('rare-ae1234')
  })

  it('kolejny przebieg minutę później nic nie wysyła', async () => {
    sky = [{ hex: 'ae1234', flight: 'LAGR11', t: 'K35R', kind: 'mil', lat: 50.3, lon: 20.3, alt_baro: 28000, track: 90 }]
    const { runNotify: notify } = await import('../netlify/functions/lib/notifyJob.js')
    await notify()
    sent.length = 0
    await notify()
    expect(sent).toEqual([])
  })
})

describe('notify — przylot z pamięci przewoźnika', () => {
  beforeEach(() => {
    stores.clear(); sent.length = 0
    const subs = store('push-subscriptions')
    for (const [k, v] of [sub('gda', 54.35, 18.65)]) subs.set(k, v)
    sky = []
  })
  const snap = (lon) => store('inbound-snapshot').set('latest', JSON.stringify({
    at: Date.now(),
    inbound: [{ hex: 'a9876e', flight: 'CMB366', t: 'B744', lat: 50.11, lon, gs: 445, track: 90,
      route: { to: 'EPRZ', toCity: 'Rzeszów', learned: true, fleet: 'CMB' } }],
  }))

  it('daleko (500 km) — jeszcze bez powiadomienia, bliżej (200 km) — jest', async () => {
    await snap(15.0)
    const { runNotify: notify } = await import('../netlify/functions/lib/notifyJob.js')
    await notify()
    expect(sent.filter(p => p.tag === 'inbound-a9876e')).toHaveLength(0)
    await snap(19.2)
    await notify()
    const push = sent.filter(p => p.tag === 'inbound-a9876e')
    expect(push).toHaveLength(1)
    expect(push[0].title).toBe('Jumbo Jet prawdopodobnie ląduje: Rzeszów')
  })
})

describe('notify — „ląduje"', () => {
  beforeEach(() => {
    stores.clear(); sent.length = 0
    const subs = store('push-subscriptions')
    for (const [k, v] of [sub('gda', 54.35, 18.65)]) subs.set(k, v)
    sky = []
  })

  it('jedno powiadomienie na lądowanie, drugi przebieg z tym samym nic nie wysyła', async () => {
    const at = Date.now()
    const snap = { at, inbound: [], justLanded: [{ flight: 'CMB366', to: 'EPRZ', t: 'B744', hex: 'a9876e', at }] }
    await store('inbound-snapshot').set('latest', JSON.stringify(snap))
    const { runNotify: notify } = await import('../netlify/functions/lib/notifyJob.js')
    await notify()
    await notify()
    const push = sent.filter(p => p.tag === 'landed-a9876e')
    expect(push).toHaveLength(1)
    expect(push[0].title).toBe('Jumbo Jet ląduje: Rzeszów')
    expect(push[0].body).toMatch(/^CMB366 · \d{2}:\d{2}$/)
  })
})
