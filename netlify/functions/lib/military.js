// Shared military aircraft filtering and fetching — kept in sync with aircraft.js

const OPENSKY_USER = process.env.OPENSKY_USER || ''
const OPENSKY_PASS = process.env.OPENSKY_PASS || ''

const MILITARY_HEX_PREFIXES = [
  'ae',
  '43c', '43d', '43e', '43f',
  '3b0', '3b1', '3b2', '3b3',
  '43a', '43b', '44e', '48f',
  '49d', '51d', '4a0', '47a', '47b',
  '478',
  '743', '744',
]

const MILITARY_CALLSIGN_PATTERNS = [
  /^RCF/i, /^PLF/i, /^DUKE/i, /^JAKE/i, /^PEARL/i, /^POLO/i,
  /^GORDO/i, /^REACH/i, /^RCH/i, /^MAGMA/i, /^ASCOT/i, /^COMET/i,
  /^NATO/i, /^NAOC/i, /^GAF\d/i, /^FRAF/i, /^BAF\d/i, /^DAMP/i,
  /^CZAF/i, /^SLAF/i, /^HUNAF/i, /^BUAF/i, /^ROTAF/i,
  /^FNY/i, /^FINAF/i, /^NRAF/i, /^SWAF/i, /^LTAF/i, /^LVAF/i, /^EEAF/i,
  /^NATOQ/i, /^FORTE/i, /^RAZER/i, /^KNIFE/i, /^ROCKY/i, /^IRON/i,
  /^SWORD/i, /^VALOR/i, /^HEAVY/i, /^SAVER/i, /^EXPL/i, /^RIMC/i,
  /^SRA/i, /^SHAHD/i, /^ZEUS/i, /^BISON/i, /^COLT/i, /^ANVIL/i,
  /^EAGLE\d/i, /^VIPER/i, /^DEMON/i, /^DRAGON\d/i, /^KNIGHT/i,
  /^SHADOW/i, /^GHOST/i, /^RAVEN/i, /^STALLION/i, /^RANGER\d/i,
  /^LANCE/i, /^SHIELD/i, /^TIGER\d/i, /^VENOM/i, /^SPECTRE/i,
  /^SPOOKY/i, /^PSYCHO/i, /^JOLLY/i, /^PEDRO/i, /^KING\d/i,
  /^PAVE/i, /^COMBAT/i,
  /^BAH/i, /^KAF/i, /^QAF/i, /^OAF/i,
]

const CIVILIAN_CALLSIGN_PATTERNS = [
  /^LOT/i, /^RYR/i, /^WZZ/i, /^DLH/i, /^BAW/i,
  /^AFR/i, /^IBE/i, /^EZY/i, /^TRA/i, /^KLM/i,
]

const GROUND_STATION_PATTERNS = [/XCAM/i, /XCAT/i, /XBAT/i]
const GROUND_STATION_TYPES = new Set(['TWR', 'GND', 'MLAT', 'RADAR'])
const MILITARY_SQUAWKS = new Set(['7777', '7400'])

function isSuspiciousHex(hex) {
  const n = parseInt(hex, 16)
  if (isNaN(n) || n === 0) return true
  const b1 = (n >> 16) & 0xFF
  const b2 = (n >> 8) & 0xFF
  const b3 = n & 0xFF
  if (b1 === b2 && b2 === b3) return true
  if (b2 - b1 === b3 - b2 && b1 !== b2) return true
  if ((n & 0xFFF) === 0xFFF) return true
  return false
}

function isMilitaryCallsign(callsign) {
  if (GROUND_STATION_PATTERNS.some(re => re.test(callsign))) return false
  if (CIVILIAN_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return false
  return MILITARY_CALLSIGN_PATTERNS.some(re => re.test(callsign))
}

function isMilitary(ac) {
  const hex = (ac[0] || '').toLowerCase()
  const callsign = (ac[1] || '').trim()
  const squawk = ac[14] != null ? String(ac[14]).padStart(4, '0') : ''
  if (GROUND_STATION_PATTERNS.some(re => re.test(callsign))) return false
  if (CIVILIAN_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return false
  if (MILITARY_HEX_PREFIXES.some(p => hex.startsWith(p))) return true
  if (MILITARY_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return true
  if (MILITARY_SQUAWKS.has(squawk)) return true
  return false
}

function isValidADSBfi(a) {
  const type = (a.t || '').toUpperCase()
  const reg = (a.r || '').toUpperCase()
  if (GROUND_STATION_TYPES.has(type) || GROUND_STATION_TYPES.has(reg)) return false
  if (a.alt_baro === 'ground' || a.on_ground) return false
  const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
  if (alt != null && (alt < 0 || alt > 60000)) return false
  if (isSuspiciousHex(a.hex)) return false
  return a.lat != null && a.lon != null
}

function mapADSBfi(a, lat, lon, radiusKm) {
  const dist = haversine(lat, lon, a.lat, a.lon)
  if (dist > radiusKm) return null
  return {
    hex: a.hex,
    flight: (a.flight || a.hex || '').trim(),
    t: a.t || '',
    lat: a.lat,
    lon: a.lon,
    alt_baro: typeof a.alt_baro === 'number' ? a.alt_baro : null,
    gs: a.gs != null ? Math.round(a.gs) : null,
    track: a.track != null ? Math.round(a.track) : null,
    squawk: a.squawk || null,
  }
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
  const headers = { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' }
  const degLat = radiusKm / 111
  const degLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180))
  const lamin = lat - degLat, lamax = lat + degLat
  const lomin = lon - degLon, lomax = lon + degLon

  try {
    // Query 1: adsb.fi /mil — globally tagged military aircraft
    const milRes = await fetch('https://opendata.adsb.fi/api/v2/mil', {
      signal: AbortSignal.timeout(5000), headers,
    })
    if (!milRes.ok) throw new Error('adsb.fi /mil failed')
    const milData = await milRes.json()

    const milAircraft = (milData.ac || milData.aircraft || [])
      .filter(a => isValidADSBfi(a) &&
        a.lat >= lamin && a.lat <= lamax &&
        a.lon >= lomin && a.lon <= lomax)
    const milHexes = new Set(milAircraft.map(a => a.hex))

    // Query 2: geographic supplement — catches aircraft military by our callsign/hex rules
    // but not tagged in adsb.fi /mil database
    let supplementAircraft = []
    try {
      const radiusNm = Math.min(250, Math.round(radiusKm * 0.54))
      const geoRes = await fetch(
        `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${radiusNm}`,
        { signal: AbortSignal.timeout(4000), headers }
      )
      if (geoRes.ok) {
        const geoData = await geoRes.json()
        supplementAircraft = (geoData.aircraft || geoData.ac || []).filter(a =>
          isValidADSBfi(a) &&
          a.lat >= lamin && a.lat <= lamax &&
          a.lon >= lomin && a.lon <= lomax &&
          !milHexes.has(a.hex) &&
          (MILITARY_HEX_PREFIXES.some(p => (a.hex || '').toLowerCase().startsWith(p)) ||
           isMilitaryCallsign((a.flight || '').trim()))
        )
      }
    } catch { /* supplement is best-effort */ }

    return [...milAircraft, ...supplementAircraft]
      .map(a => mapADSBfi(a, lat, lon, radiusKm))
      .filter(Boolean)
  } catch {}

  // OpenSky fallback
  try {
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
    const fetchOpts = { signal: AbortSignal.timeout(8000), headers }
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
