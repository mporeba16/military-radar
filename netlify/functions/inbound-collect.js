// Cron co 10 minut: zbiera jumbo jety i An-124 lecące do Rzeszowa/Krakowa
// i zapisuje migawkę w Blobs.
//
// Dzięki temu ani otwarcie aplikacji, ani przebieg powiadomień (co minutę)
// nie pytają adsb.lol ani adsbdb — ruch na stronie nie przekłada się na
// obciążenie tych darmowych serwisów.

import { getStore, connectLambda } from '@netlify/blobs'
import { collect, SNAPSHOT_STORE, SNAPSHOT_KEY } from './inbound.js'

export const handler = async (event) => {
  try { if (event?.blobs) connectLambda(event) } catch { /* poza Netlify */ }
  const startedAt = Date.now()
  try {
    const inbound = await collect()
    await getStore(SNAPSHOT_STORE).set(SNAPSHOT_KEY, JSON.stringify({ at: Date.now(), inbound }))
    const msg = `[inbound-collect] OK n=${inbound.length} in ${Date.now() - startedAt}ms`
    console.log(msg)
    return { statusCode: 200, body: msg }
  } catch (err) {
    console.error('[inbound-collect]', err.message)
    return { statusCode: 200, body: `ERROR ${err.message}` }
  }
}
