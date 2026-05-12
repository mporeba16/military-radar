import { getStore, connectLambda } from '@netlify/blobs'
import { saveTrails } from './aircraft.js'

// Szeroki bounding box pokrywający Europę + zachodnia Rosja + bliski wschód
// (lat 30°-72°, lon -15°-50°). adsb.fi /mil zwraca globalnie, więc i tak
// dostaniemy wszystko — filtr tylko żeby ograniczyć wagę zapisów.
const COLLECT_BBOX = { lamin: 30, lomin: -15, lamax: 72, lomax: 50 }

const ADSBfi_USER_AGENT = 'MilitaryRadarPL/1.0'

const GROUND_STATION_TYPES = new Set(['TWR', 'GND', 'MLAT', 'RADAR'])

function isValidRecord(a) {
  const lat = a.lat ?? a.rr_lat
  const lon = a.lon ?? a.rr_lon
  if (lat == null || lon == null) return false
  if (lat < COLLECT_BBOX.lamin || lat > COLLECT_BBOX.lamax) return false
  if (lon < COLLECT_BBOX.lomin || lon > COLLECT_BBOX.lomax) return false
  if (a.alt_baro === 'ground' || a.on_ground) return false
  const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
  if (alt != null && (alt < 0 || alt > 60000)) return false
  if (GROUND_STATION_TYPES.has((a.t || '').toUpperCase())) return false
  if (GROUND_STATION_TYPES.has((a.r || '').toUpperCase())) return false
  return true
}

function mapRecord(a) {
  const lat = a.lat ?? a.rr_lat
  const lon = a.lon ?? a.rr_lon
  return {
    hex: (a.hex || '').toLowerCase(),
    flight: (a.flight || a.hex || '').trim(),
    t: a.t || '',
    lat,
    lon,
    alt_baro: typeof a.alt_baro === 'number' ? a.alt_baro : null,
  }
}

export const handler = async (event) => {
  try { if (event?.blobs) connectLambda(event) } catch {}

  const startedAt = Date.now()
  let fetched = 0
  let saved = 0
  let error = null

  try {
    const res = await fetch('https://opendata.adsb.fi/api/v2/mil', {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': ADSBfi_USER_AGENT, 'Accept': 'application/json' },
    })
    if (!res.ok) {
      error = `adsb.fi http-${res.status}`
    } else {
      const data = await res.json()
      const raw = data.ac || data.aircraft || []
      const aircraft = raw.filter(isValidRecord).map(mapRecord).filter(a => a.hex)
      fetched = aircraft.length
      await saveTrails(aircraft)
      saved = aircraft.length
    }
  } catch (err) {
    error = err.message || 'exception'
  }

  // Zapisz statystyki ostatniego runu (do diagnostyki)
  try {
    const runs = getStore('collect-runs')
    await runs.set('latest', JSON.stringify({
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      fetched,
      saved,
      error,
    }))
  } catch {}

  const msg = `[collect] ${error ? `ERROR ${error}` : `OK fetched=${fetched} saved=${saved}`} in ${Date.now() - startedAt}ms`
  console.log(msg)
  return { statusCode: 200, body: msg }
}
