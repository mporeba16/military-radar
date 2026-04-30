// Shared military aircraft filtering and fetching logic

const OPENSKY_USER = process.env.OPENSKY_USER || ''
const OPENSKY_PASS = process.env.OPENSKY_PASS || ''

const MILITARY_HEX_PREFIXES = [
  'ae',
  '43c', '43d', '43e', '43f',
  '3b0', '3b1', '3b2', '3b3',
  '43a', '43b', '44e', '48f',
  '49d', '51d', '4a0', '47a', '47b',
]

const MILITARY_CALLSIGN_PATTERNS = [
  /^RCF/i, /^PLF/i, /^DUKE/i, /^JAKE/i, /^PEARL/i, /^POLO/i,
  /^GORDO/i, /^REACH/i, /^RCH/i, /^MAGMA/i, /^ASCOT/i, /^COMET/i,
  /^NATO/i, /^NAOC/i, /^GAF\d/i, /^FRAF/i, /^BAF\d/i, /^DAMP/i,
  /^CZAF/i, /^SLAF/i, /^HUNAF/i, /^BUAF/i, /^ROTAF/i,
]

const CIVILIAN_CALLSIGN_PATTERNS = [
  /^LOT/i, /^RYR/i, /^WZZ/i, /^DLH/i, /^BAW/i,
  /^AFR/i, /^IBE/i, /^EZY/i, /^TRA/i, /^KLM/i,
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

function stateToAircraft(s) {
  return {
    hex: s[0],
    flight: (s[1] || '').trim() || s[0],
    t: '',
    lat: s[6],
    lon: s[5],
    alt_baro: s[7] != null ? Math.round(s[7] * 3.28084) : null,
    gs: s[9] != null ? Math.round(s[9] * 1.94384) : null,
    track: s[10] != null ? Math.round(s[10]) : null,
    squawk: s[14] || null,
    country: s[2],
    on_ground: s[8],
  }
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function fetchMilitaryNear(lat, lon, radiusKm) {
  const degLat = radiusKm / 111
  const degLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180))
  const lamin = lat - degLat, lamax = lat + degLat
  const lomin = lon - degLon, lomax = lon + degLon

  // adsb.fi — primary source
  try {
    const res = await fetch('https://opendata.adsb.fi/api/v2/mil', {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      const aircraft = (data.ac || data.aircraft || [])
        .filter(a =>
          a.lat != null && a.lon != null &&
          a.lat >= lamin && a.lat <= lamax &&
          a.lon >= lomin && a.lon <= lomax
        )
        .map(a => ({
          hex: a.hex,
          flight: (a.flight || a.hex || '').trim(),
          t: a.t || '',
          lat: a.lat,
          lon: a.lon,
          alt_baro: a.alt_baro ?? null,
          gs: a.gs != null ? Math.round(a.gs) : null,
          track: a.track != null ? Math.round(a.track) : null,
          squawk: a.squawk || null,
          country: a.r || '',
        }))
        .filter(a => haversine(lat, lon, a.lat, a.lon) <= radiusKm)
      return aircraft
    }
  } catch {}

  // OpenSky — fallback
  try {
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
    const fetchOpts = {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' },
    }
    if (OPENSKY_USER && OPENSKY_PASS) {
      fetchOpts.headers['Authorization'] =
        'Basic ' + Buffer.from(`${OPENSKY_USER}:${OPENSKY_PASS}`).toString('base64')
    }
    const res = await fetch(url, fetchOpts)
    if (res.ok) {
      const data = await res.json()
      return (data.states || [])
        .filter(s => s[5] != null && s[6] != null && !s[8] && isMilitary(s))
        .map(stateToAircraft)
        .filter(a => haversine(lat, lon, a.lat, a.lon) <= radiusKm)
    }
  } catch {}

  return []
}
