// Cron co 5 minut: jumbo jety i An-124 z całego świata (adsb.lol, pytanie
// po typie) — jedno pobranie, dwie migawki w Blobs:
//   - `heavy-europe/snapshot` — maszyny nad Polską i do 100 km od granic;
//     `aircraft` dokleja je do mapy (szczegóły w lib/heavyEurope.js),
//   - `inbound-snapshot/deep-raw` — SUROWA lista do przylotów, co ~10 minut;
//     trasy (adsbdb) i cel lotu rozwiązuje cron `tick` na Netlify.
// Wcześniej robiły to dwa crony (heavy-collect i inbound-deep), które pytały
// adsb.lol o te same trzy typy — dwa razy więcej zapytań do serwisu, który
// po serii odpowiada 429.
//
// Tutaj, a nie na Netlify, bo między zapytaniami o typy czekamy — Cloudflare
// nie liczy czekania, Netlify liczył je jak pracę funkcji. Celowo nic więcej:
// darmowy plan Workers pozwala na 50 zapytań wychodzących na uruchomienie
// (liczą się też odczyty i zapisy Blobs). Tu to najwyżej 6 zapytań o typy
// (z ponowieniami), 2 odczyty i 2 zapisy.

import { getStore } from '@netlify/blobs'
import { fetchAdsbLolTypes } from '../netlify/functions/lib/sources.js'
import { carryForward, heaviesNearPoland, HEAVY_KEY, HEAVY_STORE } from '../netlify/functions/lib/heavyEurope.js'
import { watchedRecords, SNAPSHOT_STORE, DEEP_RAW_KEY } from '../netlify/functions/inbound.js'
import { WATCHED_TYPES } from '../src/lib/inbound.js'

// Lista do przylotów nie częściej niż co tyle: każda nowa to na Netlify
// przebieg pełny (odczyty tras ~70 maszyn), a za czas funkcji płacimy.
// Trochę mniej niż 10 minut, żeby co drugi przebieg crona na pewno się załapał.
const DEEP_RAW_EVERY_MS = 9 * 60 * 1000

// Tylko pola, z których korzysta rozwiązywanie przylotów — pełny rekord
// readsb ma kilkadziesiąt pól, a lista leży w Blobs i czyta ją każdy tick.
const pick = a => ({
  hex: a.hex, flight: a.flight, t: a.t, r: a.r, lat: a.lat, lon: a.lon,
  alt_baro: a.alt_baro, gs: a.gs, track: a.track, baro_rate: a.baro_rate, geom_rate: a.geom_rate,
})

export const handler = async () => {
  const startedAt = Date.now()
  try {
    const heavyStore = getStore(HEAVY_STORE)
    const inboundStore = getStore(SNAPSHOT_STORE)
    const [prevHeavy, prevRaw] = await Promise.all([
      heavyStore.get(HEAVY_KEY, { type: 'json' }).catch(() => null),
      inboundStore.get(DEEP_RAW_KEY, { type: 'json' }).catch(() => null),
    ])
    const { records, fetched, failed } = await fetchAdsbLolTypes(WATCHED_TYPES)

    // Typy, które teraz dostały 429 — ich maszyny z poprzedniej migawki.
    const heavy = carryForward(heaviesNearPoland(records, startedAt), fetched, prevHeavy, startedAt)
    const writes = [heavyStore.set(HEAVY_KEY, JSON.stringify({ at: startedAt, aircraft: heavy }))]

    // Pusta lista przy wszystkich typach na 429 to awaria, nie puste niebo —
    // lepiej zostawić poprzednią (tick po 30 min i tak uzna ją za starą).
    const rawDue = !prevRaw || startedAt - prevRaw.at >= DEEP_RAW_EVERY_MS
    const raw = rawDue && fetched.length ? watchedRecords(records).map(pick) : null
    if (raw) writes.push(inboundStore.set(DEEP_RAW_KEY, JSON.stringify({ at: startedAt, aircraft: raw })))
    await Promise.all(writes)

    const msg = `[types-collect] heavy=${heavy.length}${raw ? ` deep-raw=${raw.length}` : ''}` +
      `${failed.length ? ` błędy: ${failed.join('; ')}` : ''} in ${Date.now() - startedAt}ms`
    console.log(msg)
    return { statusCode: 200, body: msg }
  } catch (err) {
    console.error('[types-collect]', err.message)
    return { statusCode: 200, body: `ERROR ${err.message}` }
  }
}
