// Cron co minutę: jumbo jety i An-124 nad całą Europą z adsb.lol (pytanie po typie)
// zapisane jako migawka w Blobs — `aircraft` dokleja je do mapy. Szczegóły i powód
// w lib/heavyEurope.js.

import { getStore, connectLambda } from '@netlify/blobs'
import { carryForward, fetchHeavyEurope, HEAVY_KEY, HEAVY_STORE } from './lib/heavyEurope.js'

export const handler = async (event) => {
  try { if (event?.blobs) connectLambda(event) } catch { /* poza Netlify */ }
  const startedAt = Date.now()
  try {
    const store = getStore(HEAVY_STORE)
    const previous = await store.get(HEAVY_KEY, { type: 'json' }).catch(() => null)
    const { aircraft: fresh, fetched, failed } = await fetchHeavyEurope(startedAt)
    // Typy nieodpytane w tym przebiegu (rotacja, 429) — z poprzedniej migawki.
    const aircraft = carryForward(fresh, fetched, previous, startedAt)
    await store.set(HEAVY_KEY, JSON.stringify({ at: startedAt, aircraft }))
    const msg = `[heavy-collect] n=${aircraft.length}${failed.length ? ` błędy: ${failed.join('; ')}` : ''} in ${Date.now() - startedAt}ms`
    console.log(msg)
    return { statusCode: 200, body: msg }
  } catch (err) {
    console.error('[heavy-collect]', err.message)
    return { statusCode: 200, body: `ERROR ${err.message}` }
  }
}
