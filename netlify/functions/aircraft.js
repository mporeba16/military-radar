// OpenSky Network API — darmowe, bez klucza (limit: ~100 req/10min dla anonimowych)
// Docs: https://openskynetwork.github.io/opensky-api/rest.html
//
// OpenSky nie ma flagi "military", więc filtrujemy po:
// 1. Znanych blokach ICAO przydzielonych wojsku (hex prefix)
// 2. Callsignach wojskowych (RCF, PLF, DUKE, JAKE, itp.)
// 3. Squawk kodach wojskowych (7777, 7400 itp.)

import { getStore } from '@netlify/blobs'

const OPENSKY_USER = process.env.OPENSKY_USER || ''
const OPENSKY_PASS = process.env.OPENSKY_PASS || ''

const TRAIL_MAX_AGE_MS = 4 * 60 * 60 * 1000  // 4 godziny historii
const TRAIL_MIN_INTERVAL_MS = 15_000           // min. 15s między punktami

// Bloki ICAO hex przydzielone WYŁĄCZNIE wojsku (nie cywilnemu)
// Polska 489xxx obejmuje też cywilne SP- rejestracje — nie używamy go jako hex filtra
const MILITARY_HEX_PREFIXES = [
  // USA wojskowe (AE prefix — wyłącznie USAF/USN/USMC)
  'ae',
  // Niemcy Bundeswehr
  '43c', '43d', '43e', '43f',
  // Francja wojsko
  '3b0', '3b1', '3b2', '3b3',
  // Dania wojsko
  '43a',
  // Wielka Brytania RAF/RN
  '43b',
  // Belgia wojsko
  '44e',
  // Holandia wojsko
  '48f',
  // Czechy wojsko
  '49d',
  // Słowacja wojsko
  '51d',
  // Rumunia wojsko
  '4a0',
  // Węgry wojsko
  '47a', '47b',
  // Norwegia wojsko (478xxx)
  '478',
  // Jordania wojsko (74x)
  '743', '744',
]

// Callsigny wojskowe — prefiksy używane przez polskie i NATO lotnictwo
const MILITARY_CALLSIGN_PATTERNS = [
  /^RCF/i,    // Polska Siły Powietrzne
  /^PLF/i,    // Polska wojsko
  /^DUKE/i,   // USAF Europe
  /^JAKE/i,   // USAF
  /^PEARL/i,  // US Navy
  /^POLO/i,   // USAF
  /^GORDO/i,  // USAF
  /^REACH/i,  // USAF Air Mobility Command
  /^RCH/i,    // USAF Air Mobility Command
  /^MAGMA/i,  // UK RAF
  /^ASCOT/i,  // UK RAF
  /^COMET/i,  // UK RAF
  /^NATO/i,   // NATO AWACS
  /^NAOC/i,   // NATO
  /^GAF\d/i,  // German Air Force
  /^FRAF/i,   // French Air Force
  /^BAF\d/i,  // Belgian Air Force
  /^DAMP/i,   // Danish Air Force
  /^CZAF/i,   // Czech Air Force
  /^SLAF/i,   // Slovak Air Force
  /^HUNAF/i,  // Hungarian Air Force
  /^BUAF/i,   // Bulgarian Air Force
  /^ROTAF/i,  // Romanian Air Force
  /^FNY/i,    // Finnish Air Force (Ilmavoimat)
  /^FINAF/i,  // Finnish Air Force
  /^NRAF/i,   // Norwegian Air Force
  /^SWAF/i,   // Swedish Air Force
  /^LTAF/i,   // Lithuanian Air Force
  /^LVAF/i,   // Latvian Air Force
  /^EEAF/i,   // Estonian Air Force
  /^NATOQ/i,  // NATO Quick Reaction
  /^FORTE/i,  // USAF
  /^RAZER/i,  // USAF
  /^KNIFE/i,  // USAF
  /^ROCKY/i,  // USAF
  /^IRON/i,   // USAF
  /^SWORD/i,  // USAF
  /^VALOR/i,  // USAF
  /^HEAVY/i,  // USAF tankers
  /^SAVER/i,    // Norwegian Air Force (Luftforsvaret)
  /^RIMC/i,     // Italian military (Aeronautica Militare / Marina Militare)
  /^SRA/i,      // Saudi Royal Air Force
  /^SHAHD/i,    // Jordan Royal Air Force
  /^ZEUS/i,     // USAF
  /^BISON/i,    // USAF
  /^COLT/i,     // USAF
  /^ANVIL/i,    // USAF
  /^EAGLE\d/i,  // USAF (z cyfra — odróżnienie od Eagle Air)
  /^VIPER/i,    // USAF
  /^DEMON/i,    // USAF
  /^DRAGON\d/i, // NATO (z cyfra — odróżnienie od Dragonair)
  /^KNIGHT/i,   // USAF
  /^SHADOW/i,   // USAF ISR
  /^GHOST/i,    // USAF
  /^RAVEN/i,    // USAF
  /^STALLION/i, // USAF/USMC
  /^RANGER\d/i, // USAF (z cyfra — odróżnienie od Ranger Air)
  /^LANCE/i,    // NATO
  /^SHIELD/i,   // NATO
  /^TIGER\d/i,  // NATO (z cyfra — odróżnienie od Tiger Airways)
  /^VENOM/i,    // USAF
  /^SPECTRE/i,  // USAF AC-130
  /^SPOOKY/i,   // USAF AC-130
  /^PSYCHO/i,   // USAF
  /^JOLLY/i,    // USAF CSAR
  /^PEDRO/i,    // USAF CSAR
  /^KING\d/i,   // USAF tanker/CSAR (z cyfra — odróżnienie od King Airlines)
  /^PAVE/i,     // USAF special ops
  /^COMBAT/i,   // USAF
]

// Callsigny cywilnych linii — wyklucz nawet jeśli hex pasuje
const CIVILIAN_CALLSIGN_PATTERNS = [
  /^LOT/i,   // LOT Polish Airlines
  /^RYR/i,   // Ryanair
  /^WZZ/i,   // Wizz Air
  /^DLH/i,   // Lufthansa
  /^BAW/i,   // British Airways
  /^AFR/i,   // Air France
  /^IBE/i,   // Iberia
  /^EZY/i,   // easyJet
  /^TRA/i,   // Transavia
  /^KLM/i,   // KLM
]

const MILITARY_SQUAWKS = new Set(['7777', '7400'])

// Odrzuć adresy ICAO które wyglądają na syntetyczne / testowe:
// - sekwencyjne bajty (np. 0x44-0x55-0x66, różnica stała) → fake/test
// - kończące się na 0xFFF → TIS-B synthetic (FAA/TC tymczasowe adresy)
// - wszystkie bajty identyczne (np. 0xAAAAAA)
function isSuspiciousHex(hex) {
  const n = parseInt(hex, 16)
  if (isNaN(n) || n === 0) return true
  const b1 = (n >> 16) & 0xFF
  const b2 = (n >> 8) & 0xFF
  const b3 = n & 0xFF
  if (b1 === b2 && b2 === b3) return true           // 0xAAAAAA
  if (b2 - b1 === b3 - b2 && b1 !== b2) return true // 0x445566
  if ((n & 0xFFF) === 0xFFF) return true             // 0xC2BFFF
  return false
}

function isMilitary(ac) {
  const hex = (ac[0] || '').toLowerCase()
  const callsign = (ac[1] || '').trim()
  const squawk = ac[14] != null ? String(ac[14]).padStart(4, '0') : ''

  if (CIVILIAN_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return false
  if (MILITARY_HEX_PREFIXES.some(p => hex.startsWith(p))) return true
  if (MILITARY_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return true
  if (MILITARY_SQUAWKS.has(squawk)) return true
  return false
}

// OpenSky state vector indeksy:
// 0:icao24, 1:callsign, 2:origin_country, 3:time_position, 4:last_contact,
// 5:longitude, 6:latitude, 7:baro_altitude, 8:on_ground, 9:velocity,
// 10:true_track, 11:vertical_rate, 12:sensors, 13:geo_altitude,
// 14:squawk, 15:spi, 16:position_source
function stateToAircraft(s) {
  return {
    hex: s[0],
    flight: (s[1] || '').trim() || s[0],
    t: '',          // OpenSky nie zwraca typu — uzupełniamy jeśli mamy
    lat: s[6],
    lon: s[5],
    alt_baro: s[7] != null ? Math.round(s[7] * 3.28084) : null, // m → ft
    gs: s[9] != null ? Math.round(s[9] * 1.94384) : null,       // m/s → kn
    track: s[10] != null ? Math.round(s[10]) : null,
    squawk: s[14] || null,
    reg: null,
    country: s[2],
    on_ground: s[8],
  }
}

async function tryOpenSky(lamin, lomin, lamax, lomax) {
  try {
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
    const fetchOpts = {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'MilitaryRadarPL/1.0',
        'Accept': 'application/json',
      }
    }
    if (OPENSKY_USER && OPENSKY_PASS) {
      fetchOpts.headers['Authorization'] =
        'Basic ' + Buffer.from(`${OPENSKY_USER}:${OPENSKY_PASS}`).toString('base64')
    }
    const res = await fetch(url, fetchOpts)
    if (!res.ok) return null
    const data = await res.json()
    const states = data.states || []
    const military = states
      .filter(s => s[5] != null && s[6] != null && !s[8] && (s[7] == null || s[7] <= 18300) && !isSuspiciousHex(s[0]) && isMilitary(s))
      .map(stateToAircraft)
    return { aircraft: military, _source: 'opensky' }
  } catch {
    return null
  }
}

function mapADSBfiRecord(a) {
  // rr_lat/rr_lon = rough receiver position (Mode-S only, less accurate)
  const lat = a.lat ?? a.rr_lat
  const lon = a.lon ?? a.rr_lon
  return {
    hex: a.hex,
    flight: (a.flight || a.hex || '').trim(),
    t: a.t || '',
    lat,
    lon,
    alt_baro: (a.alt_baro != null && a.alt_baro !== 'ground') ? a.alt_baro : null,
    gs: a.gs != null ? Math.round(a.gs) : null,
    track: a.track != null ? Math.round(a.track) : null,
    squawk: a.squawk || null,
    reg: a.r || null,
    country: '',
  }
}

function isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax) {
  const lat = a.lat ?? a.rr_lat
  const lon = a.lon ?? a.rr_lon
  const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
  return lat != null && lon != null &&
    lat >= lamin && lat <= lamax &&
    lon >= lomin && lon <= lomax &&
    a.alt_baro !== 'ground' && !a.on_ground &&
    (alt == null || alt <= 60000) &&
    !isSuspiciousHex(a.hex)
}

function isMilitaryADSBfi(a) {
  const hex = (a.hex || '').toLowerCase()
  const callsign = (a.flight || '').trim()
  const squawk = a.squawk || ''
  if (CIVILIAN_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return false
  if (MILITARY_HEX_PREFIXES.some(p => hex.startsWith(p))) return true
  if (MILITARY_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return true
  if (MILITARY_SQUAWKS.has(squawk)) return true
  return false
}

// adsb.fi — publiczne API, działa z serverless, pokrywa Europę
// radiusKm: dla małych obszarów (Polska/GPS) robimy też zapytanie geograficzne
// żeby złapać samoloty nieoznaczone jako military w bazie adsb.fi
async function tryADSBfi(lamin, lomin, lamax, lomax, radiusKm) {
  try {
    const headers = { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' }

    // Zapytanie 1: globalny endpoint /mil (baza adsb.fi)
    const milRes = await fetch('https://opendata.adsb.fi/api/v2/mil', {
      signal: AbortSignal.timeout(10000), headers
    })
    if (!milRes.ok) return null
    const milData = await milRes.json()
    const milAircraft = (milData.ac || []).filter(a => isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax))
    const milHexes = new Set(milAircraft.map(a => a.hex))

    // Zapytanie 2: supplement geograficzny — łapie samoloty znane nam jako wojskowe
    // (hex/callsign), ale nieoznaczone w bazie adsb.fi /mil
    // adsb.fi obsługuje max 250nm (~463km); zawsze robimy supplement niezależnie od trybu
    let supplementAircraft = []
    {
      const centerLat = ((lamin + lamax) / 2).toFixed(4)
      const centerLon = ((lomin + lomax) / 2).toFixed(4)
      const radiusNm = Math.min(250, Math.round(radiusKm * 0.54))
      try {
        const geoRes = await fetch(
          `https://opendata.adsb.fi/api/v2/lat/${centerLat}/lon/${centerLon}/dist/${radiusNm}`,
          { signal: AbortSignal.timeout(8000), headers }
        )
        if (geoRes.ok) {
          const geoData = await geoRes.json()
          supplementAircraft = (geoData.aircraft || geoData.ac || []).filter(a =>
            isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax) &&
            !milHexes.has(a.hex) &&
            isMilitaryADSBfi(a)
          )
        }
      } catch { /* supplement is best-effort */ }
    }

    const ac = [...milAircraft, ...supplementAircraft].map(mapADSBfiRecord)
    return { aircraft: ac, _source: 'adsbfi' }
  } catch {
    return null
  }
}

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  const params = event.queryStringParameters || {}
  const { lat, lon, radius, hex } = params

  // Tryb pobierania trasy konkretnego samolotu
  if (hex) {
    try {
      const store = getStore('aircraft-trails')
      const data = await store.get(hex, { type: 'json' })
      return { statusCode: 200, headers, body: JSON.stringify({ trail: data?.points || [] }) }
    } catch {
      return { statusCode: 200, headers, body: JSON.stringify({ trail: [] }) }
    }
  }

  const latN = Number(lat)
  const lonN = Number(lon)
  const radiusKm = Number(radius) || 100

  if (!lat || !lon || isNaN(latN) || isNaN(lonN)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Brak parametrów lat/lon' }) }
  }

  const degLat = radiusKm / 111
  const degLon = radiusKm / (111 * Math.cos(latN * Math.PI / 180))
  const lamin = latN - degLat
  const lamax = latN + degLat
  const lomin = lonN - degLon
  const lomax = lonN + degLon

  const result = await tryADSBfi(lamin, lomin, lamax, lomax, radiusKm)
    || await tryOpenSky(lamin, lomin, lamax, lomax)
    || { aircraft: [], _source: 'unavailable' }

  saveTrails(result.aircraft).catch(() => {})

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(result)
  }
}

async function saveTrails(aircraft) {
  if (!aircraft?.length) return
  const store = getStore('aircraft-trails')
  const now = Date.now()

  await Promise.allSettled(aircraft.map(async ac => {
    if (ac.lat == null || ac.lon == null) return
    let existing = null
    try { existing = await store.get(ac.hex, { type: 'json' }) } catch {}
    const pts = (existing?.points || []).filter(p => now - p.ts < TRAIL_MAX_AGE_MS)
    const last = pts[pts.length - 1]
    if (!last || now - last.ts >= TRAIL_MIN_INTERVAL_MS) {
      pts.push({ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro, ts: now })
      await store.set(ac.hex, JSON.stringify({ points: pts, flight: ac.flight, t: ac.t }))
    }
  }))
}

