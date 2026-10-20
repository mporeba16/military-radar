// Źródła danych o ruchu: adsb.fi, adsb.lol i OpenSky — jedno miejsce na
// adresy, nagłówki, limity czasu i odczyt odpowiedzi. Wcześniej każdy z
// `aircraft`, `collect`, `notify` i `inbound` miał własną kopię, a kopie
// zdążyły się rozjechać: mapa brała listę wojskowych z adsb.fi i adsb.lol,
// a powiadomienia i trasy tylko z adsb.fi — maszyny widoczne wyłącznie
// w adsb.lol (np. włoski C-130J nad Adriatykiem) nie alarmowały i nie miały
// trasy z serwera.

import { knownAircraft, typeFromCallsign } from '../../../src/lib/knownAircraft.js'
import {
  classifyExtra, haversine, isMilitaryADSBfiRecord, isMilitaryState, isPlausibleRecord,
  isSuspiciousHex, isTrainingAircraft,
} from './military.js'

// adsb.fi przepuszcza ten nagłówek z Netlify; nie zmieniać bez sprawdzenia
// (stoi za ochroną Cloudflare, która odsiewa boty).
export const ADSBFI_HEADERS = { 'User-Agent': 'MilitaryRadarPL/1.0', Accept: 'application/json' }
// adsb.lol, adsbdb — z adresem strony, żeby wiedzieli, kto pyta.
export const POLITE_HEADERS = { 'User-Agent': 'MilitaryRadarPL/1.0 (+https://radar-wojskowy.netlify.app)', Accept: 'application/json' }

// Środek geograficzny Polski — z promieniem 250 nm (~463 km, maksimum adsb.fi)
// jedno zapytanie geograficzne pokrywa cały kraj wraz z pograniczem.
export const POLAND_CENTER = { lat: 52.0, lon: 19.4 }
export const GEO_MAX_NM = 250

export const ADSBFI_MIL_URL = 'https://opendata.adsb.fi/api/v2/mil'
export const ADSBLOL_MIL_URL = 'https://api.adsb.lol/v2/mil'

export function adsbfiGeoUrl(lat = POLAND_CENTER.lat, lon = POLAND_CENTER.lon, nm = GEO_MAX_NM) {
  return `https://opendata.adsb.fi/api/v2/lat/${Number(lat).toFixed(4)}/lon/${Number(lon).toFixed(4)}/dist/${Math.min(GEO_MAX_NM, nm)}`
}

// Rekordy z odpowiedzi readsb (adsb.fi/adsb.lol podają je jako `ac`, starsze
// wersje jako `aircraft`). Błąd niesie kod HTTP i początek odpowiedzi — sam
// „failed" nie mówi, czy to limit zapytań (429), czy blokada (strona 403).
export async function fetchRecords(url, { timeoutMs = 8000, headers = ADSBFI_HEADERS } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers })
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)
    const err = new Error(`${new URL(url).host} HTTP ${res.status} server=${res.headers.get('server') || '?'} ${snippet}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  return data.ac || data.aircraft || []
}

// Zapytanie geograficzne adsb.fi. Limit to ~1 zapytanie na sekundę, a geo
// często leci tuż po /mil — przy 429 jedno ponowienie po chwili.
export async function fetchAdsbfiGeo(lat, lon, nm, { timeoutMs = 8000 } = {}) {
  const url = adsbfiGeoUrl(lat, lon, nm)
  try {
    return await fetchRecords(url, { timeoutMs })
  } catch (err) {
    if (err.status !== 429) throw err
    await new Promise(r => setTimeout(r, 1200))
    return fetchRecords(url, { timeoutMs: Math.min(timeoutMs, 6000) })
  }
}

/**
 * Globalne listy wojskowe z adsb.fi i adsb.lol, scalone po hexie (pierwsze
 * wystąpienie wygrywa, adsb.fi pierwsze). Każde źródło opiera się na własnej
 * sieci odbiorników i ma inne dziury: na 147 maszyn w adsb.fi i 143 w adsb.lol
 * wspólnych było 121. Rzuca dopiero, gdy padną OBA.
 */
export async function fetchMilMerged() {
  const [fi, lol] = await Promise.allSettled([
    fetchRecords(ADSBFI_MIL_URL, { timeoutMs: 10000 }),
    fetchRecords(ADSBLOL_MIL_URL, { timeoutMs: 8000, headers: POLITE_HEADERS }),
  ])
  if (fi.status === 'rejected' && lol.status === 'rejected') {
    throw new Error(`/mil: ${fi.reason?.message}; ${lol.reason?.message}`)
  }
  const byHex = new Map()
  for (const r of [fi, lol]) {
    if (r.status !== 'fulfilled') continue
    for (const a of r.value) if (a?.hex && !byHex.has(a.hex)) byHex.set(a.hex, a)
  }
  return {
    records: [...byHex.values()],
    errors: [fi, lol].filter(r => r.status === 'rejected').map(r => r.reason?.message),
  }
}

// OpenSky — anonimowo (Basic auth wycofany na rzecz OAuth2, więc dawne
// OPENSKY_USER/PASS nie dawały już wyższego limitu). Tylko najlepszy-efort
// zapas, gdy adsb.fi zawiedzie; OpenSky nie podaje typu ani rejestracji, więc
// rozpoznajemy wyłącznie wojsko (po hexie/znaku).
// OpenSky state vector indeksy:
// 0:icao24, 1:callsign, 2:origin_country, 3:time_position, 4:last_contact,
// 5:longitude, 6:latitude, 7:baro_altitude, 8:on_ground, 9:velocity,
// 10:true_track, 11:vertical_rate, 12:sensors, 13:geo_altitude,
// 14:squawk, 15:spi, 16:position_source
export function openSkyStateToAircraft(s) {
  return {
    hex: (s[0] || '').toLowerCase(),
    flight: (s[1] || '').trim() || s[0],
    t: '',
    lat: s[6],
    lon: s[5],
    alt_baro: s[7] != null ? Math.round(s[7] * 3.28084) : null, // m → ft
    gs: s[9] != null ? Math.round(s[9] * 1.94384) : null,       // m/s → kn
    track: s[10] != null ? Math.round(s[10]) : null,
    baro_rate: s[11] != null ? Math.round(s[11] * 196.85) : null, // m/s → ft/min
    squawk: s[14] || null,
    reg: null,
    country: s[2],
    on_ground: s[8],
    kind: 'mil',
  }
}

/** Wojskowe w prostokącie z OpenSky albo null, gdy źródło nie odpowiada. */
export async function fetchOpenSkyMilitary({ lamin, lomin, lamax, lomax }) {
  try {
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: ADSBFI_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    return (data.states || [])
      .filter(s => s[5] != null && s[6] != null && !s[8] && (s[7] == null || s[7] <= 18300) &&
        !isSuspiciousHex(s[0]) && isMilitaryState(s))
      .map(openSkyStateToAircraft)
  } catch {
    return null
  }
}

// ── Dla powiadomień ─────────────────────────────────────────────────────────

// Ten sam przebieg notify potrzebuje listy wojskowych dwa razy (maszyny
// w promieniu subskrybentów i rzadkie maszyny nad całą Polską), a adsb.fi
// limituje ~1 zapytanie na sekundę — stąd krótka pamięć w instancji.
const MIL_CACHE_MS = 20_000
let milCache = null // { at, list }

// Powiadomienia nie dotyczą maszyn na ziemi.
const isAirborne = a => isPlausibleRecord(a) && a.alt_baro !== 'ground' && !a.on_ground

/** Wojskowe w powietrzu z adsb.fi i adsb.lol (surowe rekordy readsb). */
export async function fetchMilGlobal() {
  if (milCache && Date.now() - milCache.at < MIL_CACHE_MS) return milCache.list
  const { records } = await fetchMilMerged()
  const list = records.filter(isAirborne)
  milCache = { at: Date.now(), list }
  return list
}

function toAlertRecord(a) {
  return {
    hex: a.hex,
    flight: (a.flight || a.hex || '').trim(),
    // Tytuł powiadomienia mówi nazwę maszyny, a nie znak wywoławczy — dla
    // maszyny nadającej bez typu (polski Hercules PLF252) byłby pusty.
    t: (knownAircraft(a.hex)?.fixDb && knownAircraft(a.hex).type) || a.t || knownAircraft(a.hex)?.type || typeFromCallsign(a.flight) || '',
    // Rejestracja rozstrzyga, czyj to śmigłowiec (SP-HX = LPR), gdy znak
    // wywoławczy nic nie mówi.
    reg: (knownAircraft(a.hex)?.fixDb && knownAircraft(a.hex).reg) || a.r || null,
    // Opis z bazy adsb.fi — po nim rozpoznajemy rolę maszyn o cywilnym kodzie
    // typu (KC-767A jako B762, Shadow R1 jako B350).
    desc: a.desc || null,
    lat: a.lat,
    lon: a.lon,
    alt_baro: typeof a.alt_baro === 'number' ? a.alt_baro : null,
    gs: a.gs != null ? Math.round(a.gs) : null,
    track: a.track != null ? Math.round(a.track) : null,
    squawk: a.squawk || null,
    kind: a._kind || 'mil',
  }
}

/**
 * Maszyny do powiadomień w promieniu `radiusKm` od punktu: wojskowe z list
 * /mil oraz — z zapytania geograficznego — wojskowe po znaku/hexie, służbowe
 * śmigłowce i duże samoloty. Gdy listy /mil zawiodą, zapasowo OpenSky.
 */
export async function fetchMilitaryNear(lat, lon, radiusKm) {
  const degLat = radiusKm / 111
  const degLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180))
  const box = { lamin: lat - degLat, lamax: lat + degLat, lomin: lon - degLon, lomax: lon + degLon }
  const inBox = a => a.lat >= box.lamin && a.lat <= box.lamax && a.lon >= box.lomin && a.lon <= box.lomax
  const inRadius = a => haversine(lat, lon, a.lat, a.lon) <= radiusKm

  try {
    const mil = (await fetchMilGlobal())
      .filter(a => !isTrainingAircraft(a.t) && inBox(a))
      .map(a => ({ ...a, _kind: 'mil' }))
    const milHexes = new Set(mil.map(a => a.hex))

    let extra = []
    try {
      const radiusNm = Math.round(radiusKm * 0.54)
      extra = (await fetchAdsbfiGeo(lat, lon, radiusNm, { timeoutMs: 4000 })).flatMap(a => {
        if (!isAirborne(a) || !inBox(a) || milHexes.has(a.hex)) return []
        // Pełny test wojskowy (prefiks hex + znak + squawk) — jak na mapie,
        // żeby maszyna ze squawkiem 7777 nie odpadła tutaj.
        const kind = isMilitaryADSBfiRecord(a) ? 'mil' : classifyExtra(a)
        return kind ? [{ ...a, _kind: kind }] : []
      })
    } catch { /* uzupełnienie geograficzne jest najlepszym-efortem */ }

    return [...mil, ...extra].filter(inRadius).map(toAlertRecord)
  } catch { /* listy /mil padły — zapasowo OpenSky */ }

  return (await fetchOpenSkyMilitary(box) || []).filter(inRadius)
}
