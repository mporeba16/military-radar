// Cron co 2 minuty: zbiera jumbo jety i An-124 lecące do Rzeszowa/Krakowa
// i zapisuje migawkę w Blobs. Co dziesiąta minuta to przebieg pełny —
// z zapytaniami o typy do adsb.lol, które łapią maszynę jeszcze nad
// Atlantykiem. Częstsze przebiegi pytają tylko o ruch nad Polską, bo maszynę
// podchodzącą do lądowania widać krótko i nie wolno jej przegapić.
//
// Dzięki temu ani otwarcie aplikacji, ani przebieg powiadomień (co minutę)
// nie pytają adsb.lol ani adsbdb — ruch na stronie nie przekłada się na
// obciążenie tych darmowych serwisów.

import { getStore, connectLambda } from '@netlify/blobs'
import { collect, carryForward, SNAPSHOT_STORE, SNAPSHOT_KEY } from './inbound.js'

const DEEP_EVERY_MS = 9 * 60 * 1000

export const handler = async (event) => {
  try { if (event?.blobs) connectLambda(event) } catch { /* poza Netlify */ }
  const startedAt = Date.now()
  try {
    const store = getStore(SNAPSHOT_STORE)
    const prev = await store.get(SNAPSHOT_KEY, { type: 'json' }).catch(() => null)
    const deep = !prev?.deepAt || startedAt - prev.deepAt >= DEEP_EVERY_MS
    const found = await collect({ deep })
    const inbound = deep ? found : carryForward(found, prev?.inbound)
    await store.set(SNAPSHOT_KEY, JSON.stringify({
      at: Date.now(),
      deepAt: deep ? startedAt : prev?.deepAt,
      inbound,
    }))
    const msg = `[inbound-collect] OK n=${inbound.length} ${deep ? 'pelny' : 'lekki'} in ${Date.now() - startedAt}ms`
    console.log(msg)
    return { statusCode: 200, body: msg }
  } catch (err) {
    console.error('[inbound-collect]', err.message)
    return { statusCode: 200, body: `ERROR ${err.message}` }
  }
}
