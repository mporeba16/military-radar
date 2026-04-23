// OpenSky Network API — darmowe, bez klucza (limit: ~100 req/10min dla anonimowych)
// Docs: https://openskynetwork.github.io/opensky-api/rest.html
//
// OpenSky nie ma flagi "military", więc filtrujemy po:
// 1. Znanych blokach ICAO przydzielonych wojsku (hex prefix)
// 2. Callsignach wojskowych (RCF, PLF, DUKE, JAKE, itp.)
// 3. Squawk kodach wojskowych (7777, 7400 itp.)

const OPENSKY_USER = process.env.OPENSKY_USER || ''
const OPENSKY_PASS = process.env.OPENSKY_PASS || ''

// Bloki ICAO hex przydzielone wojsku lub mieszane wojskowo-cywilne
// Źródło: https://www.icao.int/secretariat/APAC/Documents/Block_Assignment_Table.pdf
const MILITARY_HEX_PREFIXES = [
  // Polska wojskowe (zakres 489000–48BFFF)
  '4890', '4891', '4892', '4893', '4894', '4895', '4896', '4897',
  '4898', '4899', '489a', '489b', '489c', '489d', '489e', '489f',
  '48a', '48b',
  // USA wojskowe (AE prefix — typowe dla USAF/USN)
  'ae',
  // NATO/inne wojskowe bloki
  '43c', '43d', '43e', '43f',  // Niemcy Bundeswehr
  '3b0', '3b1', '3b2', '3b3',  // Francja wojsko
  '43a',                         // Dania wojsko
  '47a', '47b',                  // Węgry
]

// Callsigny wojskowe — prefiksy używane przez polskie i NATO lotnictwo
const MILITARY_CALLSIGN_PATTERNS = [
  /^RCF/i,   // Polska wojsko (Siły Powietrzne)
  /^PLF/i,   // Polska wojsko
  /^DUKE/i,  // USAF Europe
  /^JAKE/i,  // USAF
  /^PEARL/i, // US Navy
  /^POLO/i,  // USAF
  /^GORDO/i, // USAF
  /^REACH/i, // USAF Air Mobility Command
  /^RCH/i,   // USAF Air Mobility Command
  /^MAGMA/i, // UK RAF
  /^ASCOT/i, // UK RAF
  /^COMET/i, // UK RAF
  /^NATO/i,  // NATO AWACS
  /^NAOC/i,  // NATO
  /^GAF/i,   // German Air Force
  /^GER/i,   // German military
  /^FRAF/i,  // French Air Force
  /^BAF/i,   // Belgian Air Force
  /^DAMP/i,  // Danish Air Force
  /^LNAV/i,  // various
  /^CZAF/i,  // Czech Air Force
  /^SLAF/i,  // Slovak Air Force
  /^HUNAF/i, // Hungarian Air Force
]

const MILITARY_SQUAWKS = new Set(['7777', '7400'])

function isMilitary(ac) {
  const hex = (ac[0] || '').toLowerCase()
  const callsign = (ac[1] || '').trim()
  const squawk = ac[6] != null ? String(ac[6]).padStart(4, '0') : ''

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
    const url = `https://api.adsb.fi/v1/mil`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const ac = (data.aircraft || data.ac || []).filter(a =>
      a.lat != null && a.lon != null &&
      a.lat >= lamin && a.lat <= lamax &&
      a.lon >= lomin && a.lon <= lomax
    ).map(a => ({
      hex: a.hex || a.icao,
      flight: (a.flight || a.callsign || a.hex || '').trim(),
      t: a.t || a.type || '',
      lat: a.lat,
      lon: a.lon,
      alt_baro: a.alt_baro || a.altitude || null,
      gs: a.gs || a.speed || null,
      track: a.track || a.heading || null,
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

  const { lat, lon, radius } = event.queryStringParameters || {}
  const latN = Number(lat)
  const lonN = Number(lon)
  const radiusKm = Number(radius) || 100

  if (!lat || !lon || isNaN(latN) || isNaN(lonN)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Brak parametrów lat/lon' }) }
  }

  // bbox dla OpenSky
  const degLat = radiusKm / 111
  const degLon = radiusKm / (111 * Math.cos(latN * Math.PI / 180))
  const lamin = latN - degLat
  const lamax = latN + degLat
  const lomin = lonN - degLon
  const lomax = lonN + degLon

  // Tryb demo — wymuszone przez env lub query param
  const forceDemo = process.env.DEMO_MODE === 'true' || event.queryStringParameters?.demo === '1'
  if (forceDemo) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ aircraft: mockAircraft(latN, lonN), _demo: true })
    }
  }

  // Próbuj kolejne źródła danych
  const result = await tryOpenSky(lamin, lomin, lamax, lomax)
    || await tryADSBfi(lamin, lomin, lamax, lomax)
    || { aircraft: mockAircraft(latN, lonN), _demo: true }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(result)
  }
}

function mockAircraft(lat, lon) {
  // Realistyczne samoloty wojskowe nad Polską i okolicą
  const scenarios = [
    // Myśliwce (fighter) — żółty ~18-22k ft
    { hex: 'ae1234', flight: 'DUKE71',  t: 'F-16C',   dlat: -0.8, dlon:  1.2, alt: 18000, gs: 480, track: 225, squawk: '4512', country: 'United States' },
    { hex: '489201', flight: 'PLF4512', t: 'F-16C',   dlat:  0.5, dlon: -0.9, alt: 22000, gs: 510, track: 110, squawk: '1234', country: 'Poland' },
    // Transport wojskowy (transport) — zielony ~8k i cyjan ~35k
    { hex: '489302', flight: 'RCF001',  t: 'C-130H',  dlat:  1.2, dlon:  0.4, alt:  8000, gs: 290, track: 270, squawk: '4000', country: 'Poland' },
    { hex: 'ae5678', flight: 'REACH99', t: 'C-17A',   dlat: -1.5, dlon: -1.8, alt: 35000, gs: 490, track:  85, squawk: '1001', country: 'United States' },
    { hex: '43c100', flight: 'GAF680',  t: 'A400M',   dlat:  0.2, dlon:  2.1, alt: 28000, gs: 350, track: 310, squawk: '2301', country: 'Germany' },
    // Tankowiec — niebieski ~31k ft
    { hex: 'ae9abc', flight: 'POLO14',  t: 'KC-135R', dlat: -0.3, dlon: -2.5, alt: 31000, gs: 460, track: 190, squawk: '0100', country: 'United States' },
    // Śmigłowiec (helicopter) — czerwony ~1.8k ft
    { hex: '489403', flight: 'SPLFM',   t: 'W-3A',    dlat:  0.9, dlon:  0.1, alt:  1800, gs: 120, track:  45, squawk: null,   country: 'Poland' },
    // Patrolowy (patrol) — zielono-cyjanowy ~25k ft
    { hex: 'ae2468', flight: 'JAKE01',  t: 'P-8A',    dlat: -2.0, dlon:  0.7, alt: 25000, gs: 430, track: 350, squawk: '7777', country: 'United States' },
    // RC-135 (patrol) — niebieski ~38k ft
    { hex: 'ae1357', flight: 'GORDO5',  t: 'RC-135',  dlat: -0.6, dlon:  3.2, alt: 38000, gs: 440, track: 270, squawk: '0200', country: 'United States' },
    // Dron (drone) — żółto-zielony ~15k ft
    { hex: 'ae7531', flight: 'UAVX01',  t: 'MQ-9',    dlat:  1.5, dlon:  1.8, alt: 15000, gs: 200, track: 180, squawk: null,   country: 'United States' },
    // Turbośmigłowy (turboprop) — pomarańczowy ~5k ft
    { hex: '489550', flight: 'RCF042',  t: 'C-295M',  dlat: -1.1, dlon: -0.5, alt:  5000, gs: 260, track:  60, squawk: '3210', country: 'Poland' },
    // Heavy — fioletowy ~43k ft
    { hex: 'ae3698', flight: 'REACH12', t: 'C-5M',    dlat: -2.5, dlon:  2.0, alt: 43000, gs: 500, track: 100, squawk: '2000', country: 'United States' },
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
