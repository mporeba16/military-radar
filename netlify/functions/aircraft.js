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
  /^GAF\d/i,  // German Air Force (GAF + cyfra, nie GAFER itp.)
  /^FRAF/i,   // French Air Force
  /^BAF\d/i,  // Belgian Air Force
  /^DAMP/i,   // Danish Air Force
  /^CZAF/i,   // Czech Air Force
  /^SLAF/i,   // Slovak Air Force
  /^HUNAF/i,  // Hungarian Air Force
  /^BUAF/i,   // Bulgarian Air Force
  /^ROTAF/i,  // Romanian Air Force
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
      .filter(s => s[5] != null && s[6] != null && !s[8] && isMilitary(s))
      .map(stateToAircraft)
    return { aircraft: military, _source: 'opensky' }
  } catch {
    return null
  }
}

// adsb.fi — publiczne API, działa z serverless, pokrywa Europę
async function tryADSBfi(lamin, lomin, lamax, lomax) {
  try {
    const url = `https://opendata.adsb.fi/api/v2/mil`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const ac = (data.ac || data.aircraft || []).filter(a =>
      a.lat != null && a.lon != null &&
      a.lat >= lamin && a.lat <= lamax &&
      a.lon >= lomin && a.lon <= lomax
    ).map(a => ({
      hex: a.hex,
      flight: (a.flight || a.hex || '').trim(),
      t: a.t || '',
      lat: a.lat,
      lon: a.lon,
      alt_baro: a.alt_baro != null ? a.alt_baro : null,
      gs: a.gs != null ? Math.round(a.gs) : null,
      track: a.track != null ? Math.round(a.track) : null,
      squawk: a.squawk || null,
      country: a.r || '',
    }))
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

  const forceDemo = process.env.DEMO_MODE === 'true' || params.demo === '1'
  if (forceDemo) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ aircraft: mockAircraft(latN, lonN), _demo: true })
    }
  }

  const result = await tryADSBfi(lamin, lomin, lamax, lomax)
    || await tryOpenSky(lamin, lomin, lamax, lomax)
    || { aircraft: mockAircraft(latN, lonN), _demo: true }

  // Zapisz pozycje do Netlify Blobs asynchronicznie (nie blokuj odpowiedzi)
  if (!result._demo) {
    saveTrails(result.aircraft).catch(() => {})
  }

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

function mockAircraft(lat, lon) {
  // Realistyczne samoloty wojskowe nad Polską i okolicą
  const scenarios = [
    // fighter — skośne skrzydła
    { hex: 'ae1234', flight: 'DUKE71',   t: 'F16C',   dlat: -0.8, dlon:  1.2, alt: 18000, gs: 480, track: 225, squawk: '4512', country: 'United States' },
    { hex: '489201', flight: 'PLF4512',  t: 'F16C',   dlat:  0.5, dlon: -0.9, alt: 22000, gs: 510, track: 110, squawk: '1234', country: 'Poland' },
    // delta — myśliwce delta
    { hex: 'ae2001', flight: 'TYPHOON1', t: 'EF2000', dlat:  1.0, dlon: -1.5, alt: 25000, gs: 580, track:  60, squawk: '2001', country: 'Germany' },
    { hex: 'ae2002', flight: 'RAFALE1',  t: 'RAFALE', dlat: -1.2, dlon:  0.5, alt: 20000, gs: 560, track: 140, squawk: '2002', country: 'France' },
    // transport4 — C-130
    { hex: '489302', flight: 'RCF001',   t: 'C130H',  dlat:  1.2, dlon:  0.4, alt:  8000, gs: 290, track: 270, squawk: '4000', country: 'Poland' },
    // strategic — C-17
    { hex: 'ae5678', flight: 'REACH99',  t: 'C17A',   dlat: -1.5, dlon: -1.8, alt: 35000, gs: 490, track:  85, squawk: '1001', country: 'United States' },
    // transport — A400M (2-śmigłowy styl)
    { hex: '43c100', flight: 'GAF680',   t: 'A400M',  dlat:  0.2, dlon:  2.1, alt: 28000, gs: 350, track: 310, squawk: '2301', country: 'Germany' },
    // tanker
    { hex: 'ae9abc', flight: 'POLO14',   t: 'KC135R', dlat: -0.3, dlon: -2.5, alt: 31000, gs: 460, track: 190, squawk: '0100', country: 'United States' },
    // helicopter — jednowirnikowy
    { hex: '489403', flight: 'SPLFM',    t: 'W3A',    dlat:  0.9, dlon:  0.1, alt:  1800, gs: 120, track:  45, squawk: null,   country: 'Poland' },
    { hex: 'ae8888', flight: 'HAWK71',   t: 'AH64',   dlat: -0.4, dlon: -0.8, alt:  1200, gs:  90, track: 330, squawk: null,   country: 'United States' },
    // tandem — CH-47
    { hex: 'ae7777', flight: 'CHINOOK1', t: 'CH47',   dlat:  0.4, dlon:  1.5, alt:   900, gs:  80, track:  20, squawk: null,   country: 'United States' },
    // patrol
    { hex: 'ae2468', flight: 'JAKE01',   t: 'P8A',    dlat: -2.0, dlon:  0.7, alt: 25000, gs: 430, track: 350, squawk: '7777', country: 'United States' },
    // uav
    { hex: 'ae7531', flight: 'REAPR01',  t: 'MQ9',    dlat:  1.5, dlon:  1.8, alt: 15000, gs: 200, track: 180, squawk: null,   country: 'United States' },
    // turboprop
    { hex: '489550', flight: 'RCF042',   t: 'C295M',  dlat: -1.1, dlon: -0.5, alt:  5000, gs: 260, track:  60, squawk: '3210', country: 'Poland' },
    // quad (B747-like)
    { hex: 'ae3698', flight: 'REACH12',  t: 'B747',   dlat: -2.5, dlon:  2.0, alt: 43000, gs: 500, track: 100, squawk: '2000', country: 'United States' },
  ]

  return scenarios.map((s) => ({
    hex: s.hex,
    flight: s.flight,
    t: s.t,
    lat: lat + s.dlat,
    lon: lon + s.dlon,
    alt_baro: s.alt,
    gs: s.gs,
    track: s.track,
    squawk: s.squawk,
    country: s.country,
    on_ground: false,
  }))
}
