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

  try {
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`

    const fetchOpts = { headers: {} }
    if (OPENSKY_USER && OPENSKY_PASS) {
      fetchOpts.headers['Authorization'] =
        'Basic ' + Buffer.from(`${OPENSKY_USER}:${OPENSKY_PASS}`).toString('base64')
    }

    const res = await fetch(url, fetchOpts)

    if (res.status === 429) {
      // Rate limit — zwróć mock żeby frontend nie wysypał błędu
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ aircraft: mockAircraft(latN, lonN), _ratelimited: true })
      }
    }

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: `OpenSky error ${res.status}` })
      }
    }

    const data = await res.json()
    const states = data.states || []

    const military = states
      .filter(s => s[5] != null && s[6] != null && !s[8] && isMilitary(s))
      .map(stateToAircraft)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ aircraft: military, total: states.length })
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    }
  }
}

function mockAircraft(lat, lon) {
  const types = ['F-16C', 'C-130H', 'UH-60M', 'P-8A', 'KC-135R', 'C-17A']
  const calls = ['PLF4512', 'RCF001', 'DUKE71', 'JAKE01', 'PEARL22', 'RCH456']
  return Array.from({ length: 6 }, (_, i) => ({
    hex: `ae${(1000 + i).toString(16)}`,
    flight: calls[i % calls.length],
    t: types[i % types.length],
    lat: lat + (Math.random() - 0.5) * 3,
    lon: lon + (Math.random() - 0.5) * 4,
    alt_baro: Math.round(5000 + Math.random() * 30000),
    gs: Math.round(200 + Math.random() * 400),
    track: Math.round(Math.random() * 360),
    squawk: ['7777', '1234', '4512', '0100'][i % 4],
    country: 'Poland',
    on_ground: false,
  }))
}
