// Ślady maszyn w tle — część crona `tick` (co 2 min). Dane (listy /mil
// i zapytanie geograficzne nad Polską) pobiera tick raz dla wszystkich
// zadań; tu tylko je filtrujemy i zapisujemy.
import { getStore } from '@netlify/blobs'
import { saveTrails, TRAILS_STORE, TRAIL_INDEX_STORE, TRAIL_INDEX_KEY } from '../aircraft.js'
import { BlobBook } from './blobBook.js'
import { classifyADSBfi, isPlausibleRecord, isTrainingAircraft } from './military.js'

// Szeroki bounding box pokrywający Europę + zachodnia Rosja + bliski wschód
// (lat 30°-72°, lon -15°-50°). Listy /mil są globalne, więc i tak dostaniemy
// wszystko — filtr tylko żeby ograniczyć wagę zapisów.
const COLLECT_BBOX = { lamin: 30, lomin: -15, lamax: 72, lomax: 50 }

function isValidRecord(a) {
  // Maszyny na ziemi przechodzą — saveTrails je pomija, ale granica między
  // lotami (przerwa w trasie) bierze się właśnie z tego.
  if (!isPlausibleRecord(a)) return false
  if (a.lat < COLLECT_BBOX.lamin || a.lat > COLLECT_BBOX.lamax) return false
  if (a.lon < COLLECT_BBOX.lomin || a.lon > COLLECT_BBOX.lomax) return false
  // Samoloty szkolne nie trafiają na radar, więc nie ma po co zbierać ich tras.
  return !isTrainingAircraft(a.t)
}

function mapRecord(a) {
  return {
    hex: (a.hex || '').toLowerCase(),
    flight: (a.flight || a.hex || '').trim(),
    t: a.t || '',
    lat: a.lat,
    lon: a.lon,
    alt_baro: typeof a.alt_baro === 'number' ? a.alt_baro : null,
    on_ground: a.alt_baro === 'ground' || !!a.on_ground,
    // Pozycja z MLAT bywa skokowa — saveTrails zapisuje ją rzadziej i z flagą.
    mlat: Array.isArray(a.mlat) && a.mlat.length > 0,
  }
}

// ── Sprzątanie śladów ───────────────────────────────────────────────────
// Raz na godzinę (w pół godziny, żeby nie trafiać razem ze sprzątaniem
// powiadomień) kasujemy ślady, których nie ma w indeksie — czyli takie, do
// których od 4 godzin nie dopisał się żaden punkt. Najwyżej PURGE_MAX naraz
// i z limitem czasu: zaległość z czasów bez indeksu (ponad 5 tys. blobów)
// zejdzie w kilkanaście godzin, a żaden przebieg nie stanie się przez to długi.
const PURGE_MAX = 300
const PURGE_CONCURRENCY = 10
const PURGE_BUDGET_MS = 4000

export function isPurgeRun(at) {
  return (at + 1_800_000) % 3_600_000 < 120_000
}

export async function purgeStaleTrails(now = Date.now()) {
  // Świeży odczyt indeksu, nie pamięć instancji — inna mogła dopisać ślady.
  const index = new BlobBook(TRAIL_INDEX_KEY, 4 * 60 * 60 * 1000)
  await index.load(getStore(TRAIL_INDEX_STORE), now)
  // Pusty indeks to brak danych (np. pierwszy przebieg po wdrożeniu), nie
  // „wszystko jest stare" — wtedy nie kasujemy niczego.
  if (!index.entries.size) return 0
  const trails = getStore(TRAILS_STORE)
  const { blobs } = await trails.list()
  const stale = (blobs || []).map(b => b.key).filter(k => !index.get(k, now)).slice(0, PURGE_MAX)
  let removed = 0
  let next = 0
  const deadline = now + PURGE_BUDGET_MS
  const worker = async () => {
    while (next < stale.length && Date.now() < deadline) {
      await trails.delete(stale[next++]).then(() => { removed++ }, () => {})
    }
  }
  await Promise.all(Array.from({ length: PURGE_CONCURRENCY }, worker))
  return removed
}

// `milRes` i `geoRes` to wyniki Promise.allSettled z fetchMilMerged()
// i fetchAdsbfiGeo().
export async function collectTrails({ milRes, geoRes }) {
  const startedAt = Date.now()
  let fetched = 0
  let saved = 0
  let purged = null
  let error = null
  let note = null

  try {
    // Listy /mil (adsb.fi + adsb.lol, jak na mapie) i zapytanie geograficzne
    // nad Polską — dzięki niemu w tle zbieramy też trasy służbowych śmigłowców
    // i dużych samolotów (B747/An-124), których nie ma na listach /mil.
    const byHex = new Map()

    // /mil — zapisujemy całość (z definicji wojskowe)
    if (milRes.status === 'fulfilled') {
      for (const a of milRes.value.records) {
        if (!isValidRecord(a)) continue
        const m = mapRecord(a)
        if (m.hex) byHex.set(m.hex, m)
      }
      // Jedno z dwóch źródeł padło albo nie zdążyło — ślady i tak się zapisują
      // z drugiego, więc to uwaga, nie błąd. Wcześniej szło jako ERROR i alarm
      // o awariach liczył to jako problem ticka (12 razy na dobę).
      if (milRes.value.errors.length) note = `bez ${milRes.value.errors.join('; ')}`
    } else {
      error = milRes.reason?.message
    }

    // Geo nad Polską — TYLKO maszyny, które aplikacja pokazuje (mil/heli/heavy),
    // żeby nie zapisywać tras całego ruchu cywilnego.
    if (geoRes.status === 'fulfilled') {
      for (const a of geoRes.value) {
        if (byHex.has((a.hex || '').toLowerCase())) continue
        if (!isValidRecord(a) || !classifyADSBfi(a)) continue
        const m = mapRecord(a)
        if (m.hex) byHex.set(m.hex, m)
      }
    } else {
      error = error ? `${error}; geo ${geoRes.reason?.message}` : `geo ${geoRes.reason?.message}`
    }

    const aircraft = [...byHex.values()]
    fetched = aircraft.length
    await saveTrails(aircraft)
    saved = aircraft.length
    if (isPurgeRun(startedAt)) purged = await purgeStaleTrails().catch(() => 0)
  } catch (err) {
    error = err.message || 'exception'
  }

  // Zapisz statystyki ostatniego runu (do diagnostyki)
  try {
    const runs = getStore('collect-runs')
    await runs.set('latest', JSON.stringify({
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      fetched,
      saved,
      purged,
      error,
      note,
    }))
  } catch {}

  const purgeNote = purged != null ? ` purged=${purged}` : ''
  const sourceNote = note ? ` (${note})` : ''
  return `collect ${error ? `ERROR ${error}` : `OK saved=${saved}${purgeNote}${sourceNote}`} in ${Date.now() - startedAt}ms`
}
