// Jeden cron co 2 minuty zamiast trzech (notify co minutę, collect
// i inbound-collect co 2 min). Netlify liczy kredyty za czas działania
// funkcji: trzy crony to były trzy uruchomienia i trzy zestawy zapytań
// o te same dane — listy /mil i ruch nad Polską z adsb.fi. Teraz pobieramy
// je raz i z jednej migawki korzystają ślady, przyloty i powiadomienia.
//
// Pełny przebieg przylotów (zapytania o typy do adsb.lol, z przerwami między
// nimi) chodzi na Cloudflare — cloudflare/types-collect.js.
//
// Format `export default` jest potrzebny powiadomieniom: mapy cooldownu
// czytamy ze spójnością `strong`, a ta działa tylko w funkcjach w tym formacie.

import { fetchMilMerged, fetchAdsbfiGeo, shareSnapshot } from './lib/sources.js'
import { collectTrails } from './lib/collectJob.js'
import { collectInbound } from './inbound.js'
import { runNotify } from './lib/notifyJob.js'
import { checkHealth } from './lib/health.js'

export default async () => {
  const startedAt = Date.now()
  const [milRes, geoRes] = await Promise.allSettled([fetchMilMerged(), fetchAdsbfiGeo()])
  shareSnapshot({ milRes, geoRes }, startedAt)

  // Powiadomienia czekają tylko na przyloty (czytają ich migawkę, więc cel
  // lotu jest z tego samego przebiegu), a ślady zapisują się równolegle —
  // płacimy za czas działania, więc nic nie czeka bez potrzeby. Nieudany
  // ruch nad Polską to pusta lista, nie ponowne pytanie (patrz sharedGeo).
  const inboundP = collectInbound(geoRes.status === 'fulfilled' ? geoRes.value : [])
  const [trails, inbound, notify] = await Promise.allSettled([
    collectTrails({ milRes, geoRes }),
    inboundP,
    inboundP.catch(() => {}).then(runNotify),
  ])

  const parts = [trails, inbound, notify].map(r =>
    r.status === 'fulfilled' ? r.value : `ERROR ${r.reason?.message}`)
  // Na końcu, bo ocenia wyniki pozostałych zadań (patrz lib/health.js).
  parts.push(await checkHealth({
    parts, milOk: milRes.status === 'fulfilled', geoOk: geoRes.status === 'fulfilled',
  }))
  const msg = `[tick] ${parts.join(' | ')} | razem ${Date.now() - startedAt}ms`
  console.log(msg)
  return new Response(msg)
}
