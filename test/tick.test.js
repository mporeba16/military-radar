import { describe, it, expect, vi } from 'vitest'

// Tick pobiera dane RAZ i rozdaje je trzem zadaniom. Tu sprawdzamy kolejność
// i to, że awaria jednego zadania nie zatrzymuje pozostałych.
const calls = []
vi.mock('../netlify/functions/lib/sources.js', () => ({
  fetchMilMerged: vi.fn(async () => { calls.push('mil'); return { records: [], errors: [] } }),
  fetchAdsbfiGeo: vi.fn(async () => { calls.push('geo'); return [] }),
  shareSnapshot: vi.fn(() => calls.push('share')),
}))
vi.mock('../netlify/functions/lib/collectJob.js', () => ({
  collectTrails: vi.fn(async () => { calls.push('trails'); throw new Error('blobs') }),
}))
vi.mock('../netlify/functions/inbound.js', () => ({
  collectInbound: vi.fn(async () => {
    await new Promise(r => setTimeout(r, 10))
    calls.push('inbound')
    return 'inbound n=0'
  }),
}))
vi.mock('../netlify/functions/lib/notifyJob.js', () => ({
  runNotify: vi.fn(async () => { calls.push('notify'); return 'notify OK' }),
}))

describe('tick', () => {
  it('jedno pobranie, przyloty przed powiadomieniami, błąd śladów nie blokuje reszty', async () => {
    const { default: tick } = await import('../netlify/functions/tick.js')
    const body = await (await tick()).text()
    expect(calls.filter(c => c === 'mil' || c === 'geo')).toHaveLength(2)
    expect(calls.indexOf('share')).toBeLessThan(calls.indexOf('trails'))
    expect(calls.indexOf('inbound')).toBeLessThan(calls.indexOf('notify'))
    expect(body).toMatch(/ERROR blobs/)
    expect(body).toMatch(/inbound n=0/)
    expect(body).toMatch(/notify OK/)
  })
})
