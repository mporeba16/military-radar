// Cron co 10 minut: jumbo jety i An-124 z całego świata (adsb.lol, pytanie
// po typie). Zapisuje SUROWĄ listę do migawki `deep-raw`; trasy (adsbdb)
// i cel lotu rozwiązuje cron `tick` na Netlify. Tutaj, bo między
// zapytaniami o typy czekamy (adsb.lol odpowiada 429 na serię) — Cloudflare
// nie liczy czekania, Netlify liczył je jak pracę funkcji.
//
// Celowo nic więcej: darmowy plan Workers pozwala na 50 zapytań wychodzących
// na uruchomienie (liczą się też odczyty i zapisy Blobs). Pełne rozwiązywanie
// tras tutaj kończyło się błędem „Too many subrequests". Teraz to 3 zapytania
// o typy i 1 zapis.

import { getStore } from '@netlify/blobs'
import { fetchWatchedTypes, SNAPSHOT_STORE, DEEP_RAW_KEY } from '../netlify/functions/inbound.js'

// Tylko pola, z których korzysta rozwiązywanie przylotów — pełny rekord
// readsb ma kilkadziesiąt pól, a lista leży w Blobs i czyta ją każdy tick.
const pick = a => ({
  hex: a.hex, flight: a.flight, t: a.t, r: a.r, lat: a.lat, lon: a.lon,
  alt_baro: a.alt_baro, gs: a.gs, track: a.track, baro_rate: a.baro_rate, geom_rate: a.geom_rate,
})

export const handler = async () => {
  const startedAt = Date.now()
  try {
    const aircraft = (await fetchWatchedTypes()).map(pick)
    await getStore(SNAPSHOT_STORE).set(DEEP_RAW_KEY, JSON.stringify({ at: startedAt, aircraft }))
    const msg = `[inbound-deep] n=${aircraft.length} in ${Date.now() - startedAt}ms`
    console.log(msg)
    return { statusCode: 200, body: msg }
  } catch (err) {
    console.error('[inbound-deep]', err.message)
    return { statusCode: 200, body: `ERROR ${err.message}` }
  }
}
