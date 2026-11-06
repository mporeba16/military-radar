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

const sleep = ms => new Promise(r => setTimeout(r, ms))

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
export async function fetchRecords(url, { timeoutMs = 6000, headers = ADSBFI_HEADERS } = {}) {
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
export async function fetchAdsbfiGeo(lat, lon, nm, { timeoutMs = 6000 } = {}) {
  const url = adsbfiGeoUrl(lat, lon, nm)
  try {
    return await fetchRecords(url, { timeoutMs })
  } catch (err) {
    if (err.status !== 429) throw err
    await sleep(1200)
    return fetchRecords(url, { timeoutMs: Math.min(timeoutMs, 6000) })
  }
}

/**
 * Wszystkie maszyny podanych typów z całego świata (adsb.lol /v2/type).
 * Jedyne źródło, które łapie 747 jeszcze nad Atlantykiem — adsb.fi nie ma
 * pytania po typie. Typy po kolei, z odstępem, bo adsb.lol po kilku
 * zapytaniach pod rząd odpowiada 429; przy 429 jedno ponowienie po dłuższej
 * przerwie. Typ, który się nie udał, trafia do `failed` i nie zabiera reszty.
 * Wcześniej dwie kopie tej funkcji (migawka nad Europą i przyloty) pytały
 * o te same trzy typy w dwóch osobnych cronach.
 */
export async function fetchAdsbLolTypes(types, { gapMs = 1500, retryMs = 3000, timeoutMs = 6000 } = {}) {
  const byHex = new Map()
  const fetched = []
  const failed = []
  for (const [i, type] of types.entries()) {
    if (i) await sleep(gapMs)
    const url = `https://api.adsb.lol/v2/type/${type}`
    const get = () => fetchRecords(url, { timeoutMs, headers: POLITE_HEADERS })
    try {
      const records = await get().catch(async err => {
        if (err.status !== 429) throw err
        await sleep(retryMs)
        return get()
      })
      for (const a of records) if (a?.hex && !byHex.has(a.hex)) byHex.set(a.hex, a)
      fetched.push(type)
    } catch (err) {
      failed.push(`${type}: ${err.message}`)
    }
  }
  return { records: [...byHex.values()], fetched, failed }
}

// Gdy jedno źródło już odpowiedziało, na drugie czekamy najwyżej tyle.
// Pomiar z 06.11.2026: 12 razy na dobę jedno z nich nie odpowiadało w 6 s,
// a tick czekał na nie do końca (~7 s zamiast ~2,5 s), choć miał już listę
// z drugiego. Kilka maszyn widocznych tylko w jednym źródle wróci za 2 minuty.
export const MIL_SECOND_SOURCE_GRACE_MS = 2000

/**
 * Globalne listy wojskowe z adsb.fi i adsb.lol, scalone po hexie (pierwsze
 * wystąpienie wygrywa, adsb.fi pierwsze). Każde źródło opiera się na własnej
 * sieci odbiorników i ma inne dziury: na 147 maszyn w adsb.fi i 143 w adsb.lol
 * wspólnych było 121. Rzuca dopiero, gdy padną OBA. `errors` opisuje źródło,
 * które padło albo nie zdążyło — to nie awaria, dopóki drugie działa.
 */
export async function fetchMilMerged({ graceMs = MIL_SECOND_SOURCE_GRACE_MS } = {}) {
  const sources = [
    ['adsb.fi', fetchRecords(ADSBFI_MIL_URL, { timeoutMs: 6000 })],
    ['adsb.lol', fetchRecords(ADSBLOL_MIL_URL, { timeoutMs: 6000, headers: POLITE_HEADERS })],
  ]
  const results = await new Promise(resolve => {
    const out = sources.map(() => null)
    let timer = null
    const finish = () => { clearTimeout(timer); resolve(out) }
    sources.forEach(([, p], i) => p.then(
      value => ({ status: 'fulfilled', value }),
      reason => ({ status: 'rejected', reason }),
    ).then(r => {
      out[i] = r
      if (out.every(Boolean)) return finish()
      if (r.status === 'fulfilled' && !timer) timer = setTimeout(finish, graceMs)
    }))
  })
  const settled = results.map(r => r ?? { status: 'rejected', reason: new Error(`brak odpowiedzi w ${graceMs} ms po drugim źródle`) })
  if (settled.every(r => r.status === 'rejected')) {
    throw new Error(`/mil: ${settled.map((r, i) => `${sources[i][0]}: ${r.reason?.message}`).join('; ')}`)
  }
  const byHex = new Map()
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    for (const a of r.value) if (a?.hex && !byHex.has(a.hex)) byHex.set(a.hex, a)
  }
  return {
    records: [...byHex.values()],
    errors: settled.flatMap((r, i) => r.status === 'rejected' ? [`${sources[i][0]}: ${r.reason?.message}`] : []),
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
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: ADSBFI_HEADERS })
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

// ── Wspólna migawka jednego przebiegu crona ───────────────────────────────
// Cron `tick` pobiera listy /mil i ruch nad Polską RAZ i udostępnia je tutaj
// wszystkim zadaniom (ślady, przyloty, powiadomienia). Wcześniej trzy osobne
// crony pytały o to samo, a Netlify liczy kredyty za każdą sekundę funkcji.
const SHARED_MAX_AGE_MS = 60_000
let shared = null // { at, mil: records|null, geo: records|null }

// `milRes`/`geoRes` — wyniki Promise.allSettled z fetchMilMerged()
// i fetchAdsbfiGeo() (domyślne koło: środek Polski, GEO_MAX_NM).
export function shareSnapshot({ milRes, geoRes }, at = Date.now()) {
  shared = {
    at,
    mil: milRes?.status === 'fulfilled' ? milRes.value.records : null,
    geo: geoRes?.status === 'fulfilled' ? geoRes.value : null,
  }
}

// Ruch nad Polską z migawki ticka. Gdy tick nie dostał go od adsb.fi, puste
// zamiast ponownego pytania: fetchAdsbfiGeo już raz ponowił po 429, więc
// trzecia próba chwilę później zwykle też padnie, a każde czekanie (do 6 s)
// Netlify liczy w kredytach. Inaczej niż listy /mil — tamte bez ponowienia,
// więc powiadomienia próbują je pobrać same.
// `undefined` — brak świeżej migawki (wywołanie spoza ticka), pytamy sami.
export function sharedGeo() {
  return sharedFresh() ? shared.geo ?? [] : undefined
}

const sharedFresh = () => shared && Date.now() - shared.at < SHARED_MAX_AGE_MS

// Koło (lat, lon, km) mieści się w kole wspólnego zapytania geograficznego.
function insideSharedGeo(lat, lon, radiusKm) {
  return haversine(POLAND_CENTER.lat, POLAND_CENTER.lon, lat, lon) + radiusKm <= GEO_MAX_NM * 1.852
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
  const { records } = sharedFresh() && shared.mil ? { records: shared.mil } : await fetchMilMerged()
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
      // W ticku nie pytamy adsb.fi drugi raz: koło poza wspólnym zapytaniem
      // (subskrypcja za granicą, np. Jersey) dostaje tylko wojsko z globalnych
      // list /mil — bez lokalnych śmigłowców służbowych i jumbo jetów, które
      // przyszłyby wyłącznie z zapytania geograficznego (decyzja użytkownika
      // 06.11.2026: dodatkowe zapytanie co 2 min kosztowało kredyty Netlify).
      const fromTick = sharedGeo() === undefined ? undefined
        : insideSharedGeo(lat, lon, radiusKm) ? sharedGeo() : []
      const geo = fromTick ?? await fetchAdsbfiGeo(lat, lon, radiusNm, { timeoutMs: 4000 })
      extra = geo.flatMap(a => {
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
