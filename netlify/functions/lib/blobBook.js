// Słownik w jednym blobie: klucz (znak wywoławczy) → rekord z polem `at`.
//
// Wcześniej każda trasa i każde lądowanie było osobnym blobem (`route-…`,
// `landed-…`). Nic ich nie kasowało, więc tras przybyło 3630, choć ważne są
// tylko z ostatniej doby — a przebieg pełny przylotów czytał ~70 takich blobów
// po kolei, za co Netlify liczy czas funkcji. Teraz jeden odczyt na instancję
// (odświeżany co RELOAD_MS, żeby widzieć zapisy innych instancji), jeden zapis
// na przebieg, a przeterminowane wpisy wypadają przy zapisie.

const RELOAD_MS = 10 * 60 * 1000

export class BlobBook {
  // `ttlMs(rec)` — jak długo wpis jest ważny; funkcja, bo różne wpisy mogą
  // żyć różnie długo (np. niepewne lądowania krócej).
  constructor(key, ttlMs) {
    this.key = key
    this.ttlOf = typeof ttlMs === 'function' ? ttlMs : () => ttlMs
    this.entries = null
    this.dirty = new Map()
    this.loadedAt = 0
  }

  async #read(store) {
    const saved = store ? await store.get(this.key, { type: 'json' }).catch(() => null) : null
    return new Map(Object.entries(saved?.entries || {}))
  }

  async load(store, now = Date.now()) {
    if (this.entries && now - this.loadedAt < RELOAD_MS) return
    this.entries = await this.#read(store)
    // Niezapisane (np. po nieudanym zapisie) nie mogą zniknąć przy odświeżeniu.
    for (const [k, v] of this.dirty) this.entries.set(k, v)
    this.loadedAt = now
  }

  #fresh(rec, now) {
    return !!rec && now - rec.at < this.ttlOf(rec)
  }

  get(key, now = Date.now()) {
    const rec = this.entries?.get(key)
    return this.#fresh(rec, now) ? rec : undefined
  }

  set(key, rec) {
    if (!this.entries) this.entries = new Map()
    this.entries.set(key, rec)
    this.dirty.set(key, rec)
  }

  // Zapis tylko zmian, scalonych z tym, co jest w blobie TERAZ — inna
  // instancja mogła w międzyczasie dopisać swoje. Przy tym samym kluczu
  // wygrywa nowszy wpis.
  async save(store, now = Date.now()) {
    if (!store || !this.dirty.size) return
    const merged = await this.#read(store)
    for (const [k, v] of this.dirty) {
      const prev = merged.get(k)
      if (!prev || prev.at <= v.at) merged.set(k, v)
    }
    for (const [k, v] of merged) if (!this.#fresh(v, now)) merged.delete(k)
    await store.set(this.key, JSON.stringify({ entries: Object.fromEntries(merged) }))
    this.entries = merged
    this.dirty.clear()
    this.loadedAt = now
  }
}
