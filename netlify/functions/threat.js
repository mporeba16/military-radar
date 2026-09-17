// GET /.netlify/functions/threat → bieżący szacunek ryzyka dronowego dla
// wschodnich województw.
//
// Koszt: zero. Jedyne wyjście na zewnątrz to ubilling.net.ua/aerialalerts
// (bez klucza, bez limitu, sam się cache'uje ~1 min). Sygnał ADS-B bierzemy
// z blobu, który aircraft.js i tak zapisuje przy obsłudze klientów — nie
// dokładamy ani jednego zapytania do adsb.fi, które i tak dławi się na 429.
//
// Stan trzymamy w Blobs przez STATE_TTL_MS, więc niezależnie od liczby
// klientów ubilling jest odpytywany najwyżej raz na minutę.

import { getStore, connectLambda } from '@netlify/blobs'
import { corsHeaders } from './lib/security.js'
import { snapshotKey } from './aircraft.js'
import {
  parseUbilling,
  readAdsbSignals,
  buildThreatState,
  updateBaseline,
  BASELINE_DEFAULT,
} from './lib/threat.js'

const UBILLING_URL = 'https://ubilling.net.ua/aerialalerts/'
const STATE_TTL_MS = 60_000

// Snapshot zapisuje aircraft.js przy obsłudze klientów, więc gdy nikt nie
// patrzy, potrafi być godzinami stary. Starszy niż to traktujemy jak brak
// danych — inaczej ogłaszalibyśmy nocny ruch jako bieżący.
const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000

// Musi odpowiadać temu, czym odpytuje klient (App.jsx: EUROPE_CENTER / 2800 km),
// bo to jego snapshot czytamy.
const CLIENT_SNAPSHOT_KEY = snapshotKey(52.0, 15.0, 2800)

async function fetchUkraineAlerts() {
  try {
    const res = await fetch(UBILLING_URL, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' },
    })
    if (!res.ok) return { ok: false, alerts: [], error: `http-${res.status}` }
    return parseUbilling(await res.json())
  } catch (err) {
    return { ok: false, alerts: [], error: err.name === 'TimeoutError' ? 'timeout' : 'fetch-failed' }
  }
}

// Zwraca null zawsze, gdy nie mamy ŚWIEŻEGO zdjęcia ruchu — także dla pustej
// tablicy. Puste niebo w snapshocie nie znaczy „nic nie lata”, tylko „nikt
// ostatnio nie odpytywał adsb.fi”; potraktowanie tego jako zera zaniżyłoby
// normę i przy następnym realnym odczycie każdy zwykły ruch wyglądałby na
// wzmożony.
async function readSnapshot(store) {
  if (!store) return null
  try {
    const snap = await store.get(CLIENT_SNAPSHOT_KEY, { type: 'json' })
    if (!snap?.aircraft?.length) return null
    if (!snap.ts || Date.now() - snap.ts > SNAPSHOT_MAX_AGE_MS) return null
    return snap.aircraft
  } catch {
    return null
  }
}

export const handler = async (event) => {
  connectLambda(event)
  const headers = corsHeaders(event)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let store = null
  try { store = getStore('threat') } catch {}

  // Świeży stan z poprzedniego wywołania — nie ruszamy sieci.
  if (store) {
    try {
      const cached = await store.get('state', { type: 'json' })
      if (cached?.ts && Date.now() - cached.ts < STATE_TTL_MS) {
        return respond(headers, { ...cached.state, _cached: true })
      }
    } catch { /* brak cache → licz od nowa */ }
  }

  let snapStore = null
  try { snapStore = getStore('aircraft-snapshot') } catch {}

  const [ua, aircraft, baselineRec] = await Promise.all([
    fetchUkraineAlerts(),
    readSnapshot(snapStore),
    store ? store.get('baseline', { type: 'json' }).catch(() => null) : null,
  ])

  const adsb = readAdsbSignals(aircraft)
  // Zimny start: normą jest to, co widzimy teraz. Inaczej pierwsze wywołanie po
  // deployu porównywałoby realny ruch ze sztywną stałą i ogłaszało „wzmożenie”
  // przy zupełnie zwyczajnym popołudniu.
  const prevBaseline = Number.isFinite(baselineRec?.value)
    ? baselineRec.value
    : (adsb.ok ? adsb.milOverPoland : BASELINE_DEFAULT)
  const state = buildThreatState({ ua, adsb, baseline: prevBaseline })

  if (store) {
    const writes = [store.set('state', JSON.stringify({ ts: Date.now(), state })).catch(() => {})]
    // Baseline przesuwamy tylko wtedy, gdy naprawdę mieliśmy na czym — inaczej
    // pusty snapshot (zimny start, nikt nie patrzy) ściągnąłby średnią do zera
    // i przy następnym odczycie każdy normalny ruch wyglądałby na wzmożony.
    if (adsb.ok && aircraft?.length) {
      const next = updateBaseline(prevBaseline, adsb.milOverPoland)
      writes.push(store.set('baseline', JSON.stringify({ value: next, at: Date.now() })).catch(() => {}))
    }
    await Promise.all(writes)
  }

  return respond(headers, state)
}

function respond(headers, state) {
  return {
    statusCode: 200,
    // Klient odpytuje co minutę; CDN sklei równoległe wejścia w jedno trafienie
    // do funkcji, a i tak każde z nich dostałoby ten sam stan z Blobs.
    headers: { ...headers, 'Cache-Control': 'public, max-age=0, s-maxage=45' },
    body: JSON.stringify(state),
  }
}
