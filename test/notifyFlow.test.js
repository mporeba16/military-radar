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
  fetchMilitaryNear: async () => sky,
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
    const { default: notify } = await import('../netlify/functions/notify.js')
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
    const { default: notify } = await import('../netlify/functions/notify.js')
    await notify()
    sent.length = 0
    await notify()
    expect(sent).toEqual([])
  })
})
