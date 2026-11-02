// Cron co 10 minut: pełny przebieg przylotów — jumbo jety i An-124 z całego
// świata (adsb.lol, pytanie po typie) z celem w Rzeszowie albo Krakowie.
// Wynik trafia do migawki `deep`; cron `tick` na Netlify co 2 minuty
// dokłada do niej świeży ruch nad Polską. Tutaj, bo między zapytaniami
// o typy czekamy (adsb.lol odpowiada 429 na serię) — Cloudflare nie liczy
// czekania, Netlify liczył je jak pracę funkcji.

import { getStore } from '@netlify/blobs'
import { collect, SNAPSHOT_STORE, DEEP_KEY } from '../netlify/functions/inbound.js'

export const handler = async () => {
  const startedAt = Date.now()
  try {
    // Ruchu nad Polską nie pobieramy: adsb.fi odpowiada Cloudflare 403,
    // a tę część i tak robi tick.
    const inbound = await collect({ deep: true, nearRecords: [] })
    await getStore(SNAPSHOT_STORE).set(DEEP_KEY, JSON.stringify({ at: startedAt, inbound }))
    const msg = `[inbound-deep] n=${inbound.length} in ${Date.now() - startedAt}ms`
    console.log(msg)
    return { statusCode: 200, body: msg }
  } catch (err) {
    console.error('[inbound-deep]', err.message)
    return { statusCode: 200, body: `ERROR ${err.message}` }
  }
}
