import { describe, it, expect } from 'vitest'
import { BlobBook } from '../netlify/functions/lib/blobBook.js'

const memStore = () => {
  const data = new Map()
  return {
    data,
    get: async (k) => (data.has(k) ? JSON.parse(data.get(k)) : null),
    set: async (k, v) => { data.set(k, v) },
  }
}
const H = 3600_000

describe('BlobBook', () => {
  it('przeterminowane wpisy nie są zwracane i wypadają przy zapisie', async () => {
    const store = memStore()
    const now = 100 * H
    store.data.set('b', JSON.stringify({ entries: { OLD: { at: now - 30 * H }, NEW: { at: now - H } } }))
    const book = new BlobBook('b', 24 * H)
    await book.load(store, now)
    expect(book.get('OLD', now)).toBeUndefined()
    expect(book.get('NEW', now)).toEqual({ at: now - H })
    book.set('X', { at: now })
    await book.save(store, now)
    expect(Object.keys(JSON.parse(store.data.get('b')).entries).sort()).toEqual(['NEW', 'X'])
  })

  it('zapis scala z tym, co dopisała inna instancja', async () => {
    const store = memStore()
    const a = new BlobBook('b', 24 * H)
    const b = new BlobBook('b', 24 * H)
    await a.load(store, H)
    await b.load(store, H)
    a.set('A1', { at: H })
    b.set('B1', { at: H })
    await a.save(store, H)
    await b.save(store, H)
    expect(Object.keys(JSON.parse(store.data.get('b')).entries).sort()).toEqual(['A1', 'B1'])
  })

  it('bez zmian nie zapisuje; nieudany zapis zostawia zmiany na następny raz', async () => {
    const store = memStore()
    let fail = true
    const writes = []
    const flaky = { ...store, set: async (k, v) => { writes.push(k); if (fail) throw new Error('blobs'); store.data.set(k, v) } }
    const book = new BlobBook('b', 24 * H)
    await book.load(flaky, H)
    await book.save(flaky, H)
    expect(writes).toEqual([])
    book.set('A', { at: H })
    await expect(book.save(flaky, H)).rejects.toThrow('blobs')
    fail = false
    await book.save(flaky, H)
    expect(JSON.parse(store.data.get('b')).entries.A).toEqual({ at: H })
  })

  it('czas życia może zależeć od wpisu', async () => {
    const store = memStore()
    const now = 100 * H
    store.data.set('b', JSON.stringify({ entries: { U: { at: now - 10 * H, unverified: true }, V: { at: now - 10 * H } } }))
    const book = new BlobBook('b', rec => rec.unverified ? 5 * H : 50 * H)
    await book.load(store, now)
    expect(book.get('U', now)).toBeUndefined()
    expect(book.get('V', now)).toBeDefined()
  })
})
