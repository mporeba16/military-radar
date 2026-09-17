// Jedno źródło prawdy o bieżącym ryzyku — używa go i endpoint HTTP (`threat`),
// i cron powiadomień (`notify`). Bez tego mapa i push liczyłyby własne wersje
// tej samej liczby i potrafiłyby się rozjechać.
//
// Stan trzymamy w Blobs, więc ubilling jest odpytywany najwyżej raz na
// `maxAgeMs`, niezależnie od tego, ilu klientów patrzy i czy akurat chodzi cron.

import { getStore } from '@netlify/blobs'
import { snapshotKey } from './snapshot.js'
import {
  parseUbilling,
  readAdsbSignals,
  buildThreatState,
  updateBaseline,
  BASELINE_DEFAULT,
} from './threat.js'

const UBILLING_URL = 'https://ubilling.net.ua/aerialalerts/'
export const THREAT_STATE_TTL_MS = 60_000

// Snapshot zapisuje aircraft.js przy obsłudze klientów, więc gdy nikt nie
// patrzy, potrafi być godzinami stary. Starszy niż to traktujemy jak brak
// danych — inaczej ogłaszalibyśmy nocny ruch jako bieżący.
const SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000

// Musi odpowiadać temu, czym odpytuje klient (App.jsx: EUROPE_CENTER / 2800 km),
// bo to jego snapshot czytamy.
const CLIENT_SNAPSHOT_KEY = snapshotKey(52.0, 15.0, 2800)

async function fetchUkraineAlerts(timeoutMs) {
  try {
    const res = await fetch(UBILLING_URL, {
      signal: AbortSignal.timeout(timeoutMs),
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

/**
 * @param {object}   opts
 * @param {number}   opts.maxAgeMs          po jakim czasie stan uznajemy za nieświeży
 * @param {number}   opts.ubillingTimeoutMs budżet na zapytanie do ubillinga
 * @param {Array?}   opts.fallbackAircraft  ruch pobrany już przez wywołującego,
 *   używany TYLKO gdy snapshot klienta jest pusty lub przestarzały (notify ma
 *   swój świeży zrzut z każdego przebiegu, więc push działa też wtedy, gdy
 *   nikt nie ma otwartej aplikacji).
 */
export async function resolveThreatState({
  maxAgeMs = THREAT_STATE_TTL_MS,
  ubillingTimeoutMs = 8000,
  fallbackAircraft = null,
} = {}) {
  let store = null
  try { store = getStore('threat') } catch {}

  if (store) {
    try {
      const cached = await store.get('state', { type: 'json' })
      if (cached?.ts && Date.now() - cached.ts < maxAgeMs) {
        return { state: cached.state, cached: true }
      }
    } catch { /* brak cache → licz od nowa */ }
  }

  let snapStore = null
  try { snapStore = getStore('aircraft-snapshot') } catch {}

  const [ua, clientAircraft, baselineRec] = await Promise.all([
    fetchUkraineAlerts(ubillingTimeoutMs),
    readSnapshot(snapStore),
    store ? store.get('baseline', { type: 'json' }).catch(() => null) : null,
  ])

  const aircraft = clientAircraft || (fallbackAircraft?.length ? fallbackAircraft : null)
  const adsb = readAdsbSignals(aircraft)
  // Zimny start: normą jest to, co widzimy teraz. Inaczej pierwsze wywołanie po
  // deployu porównywałoby realny ruch ze sztywną stałą i ogłaszało „wzmożenie”
  // przy zupełnie zwyczajnym popołudniu.
  const prevBaseline = Number.isFinite(baselineRec?.value)
    ? baselineRec.value
    : (adsb.ok ? adsb.milOverPoland : BASELINE_DEFAULT)

  const state = buildThreatState({ ua, adsb, baseline: prevBaseline })
  state.signals.adsb.source = !aircraft ? null
    : clientAircraft ? 'client-snapshot' : 'notify-sweep'

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

  return { state, cached: false }
}
