import { getStore, connectLambda } from '@netlify/blobs'
import { saveTrails } from './aircraft.js'
import { classifyADSBfi } from './lib/military.js'

// Szeroki bounding box pokrywający Europę + zachodnia Rosja + bliski wschód
// (lat 30°-72°, lon -15°-50°). adsb.fi /mil zwraca globalnie, więc i tak
// dostaniemy wszystko — filtr tylko żeby ograniczyć wagę zapisów.
const COLLECT_BBOX = { lamin: 30, lomin: -15, lamax: 72, lomax: 50 }

// Środek Polski — zapytanie geograficzne 250nm pokrywa cały kraj. Dzięki niemu
// w tle zbieramy też trasy służbowych śmigłowców i dużych samolotów (B747/An-124),
// których nie ma w globalnym /mil.
const POLAND_CENTER = { lat: '52.0', lon: '19.4' }

const ADSBfi_USER_AGENT = 'MilitaryRadarPL/1.0'

const GROUND_STATION_TYPES = new Set(['TWR', 'GND', 'MLAT', 'RADAR'])

function isValidRecord(a) {
  // Tylko realna pozycja (ADS-B / MLAT) — bez rr_lat/rr_lon (rough receiver).
  const lat = a.lat
  const lon = a.lon
  if (lat == null || lon == null) return false
  if (lat < COLLECT_BBOX.lamin || lat > COLLECT_BBOX.lamax) return false
  if (lon < COLLECT_BBOX.lomin || lon > COLLECT_BBOX.lomax) return false
  // Note: ground / on_ground aircraft are allowed through here, but
  // saveTrails skips them — so they don't get persisted as trail points.
  // (We want grounded craft visible in the live feed, not in trails.)
  const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
  if (alt != null && (alt < 0 || alt > 60000)) return false
  if (GROUND_STATION_TYPES.has((a.t || '').toUpperCase())) return false
  if (GROUND_STATION_TYPES.has((a.r || '').toUpperCase())) return false
  return true
}

function mapRecord(a) {
  return {
    hex: (a.hex || '').toLowerCase(),
    flight: (a.flight || a.hex || '').trim(),
    t: a.t || '',
    lat: a.lat,
    lon: a.lon,
    alt_baro: typeof a.alt_baro === 'number' ? a.alt_baro : null,
    on_ground: a.alt_baro === 'ground' || !!a.on_ground,
    // MLAT-derived (skokowy) — saveTrails go pomija, by nie zaśmiecać trasy.
    mlat: Array.isArray(a.mlat) && a.mlat.length > 0,
  }
}

export const handler = async (event) => {
  try { if (event?.blobs) connectLambda(event) } catch {}

  const startedAt = Date.now()
  let fetched = 0
  let saved = 0
  let error = null

  try {
    const headers = { 'User-Agent': ADSBfi_USER_AGENT, 'Accept': 'application/json' }
    const [milRes, geoRes] = await Promise.allSettled([
      // Globalne /mil — wszystkie wojskowe
      fetch('https://opendata.adsb.fi/api/v2/mil', { signal: AbortSignal.timeout(10000), headers }),
      // Geograficzne nad Polską — całość ruchu; filtrujemy do mil/heli/heavy
      fetch(`https://opendata.adsb.fi/api/v2/lat/${POLAND_CENTER.lat}/lon/${POLAND_CENTER.lon}/dist/250`,
        { signal: AbortSignal.timeout(10000), headers }),
    ])

    const byHex = new Map()

    // /mil — zapisujemy całość (z definicji wojskowe)
    if (milRes.status === 'fulfilled' && milRes.value.ok) {
      const data = await milRes.value.json()
      for (const a of (data.ac || data.aircraft || [])) {
        if (!isValidRecord(a)) continue
        const m = mapRecord(a)
        if (m.hex) byHex.set(m.hex, m)
      }
    } else {
      error = milRes.status === 'fulfilled' ? `adsb.fi /mil http-${milRes.value.status}` : 'adsb.fi /mil exception'
    }

    // Geo nad Polską — TYLKO maszyny, które aplikacja pokazuje (mil/heli/heavy),
    // żeby nie zapisywać tras całego ruchu cywilnego.
    if (geoRes.status === 'fulfilled' && geoRes.value.ok) {
      const data = await geoRes.value.json()
      for (const a of (data.aircraft || data.ac || [])) {
        if (byHex.has((a.hex || '').toLowerCase())) continue
        if (!isValidRecord(a) || !classifyADSBfi(a)) continue
        const m = mapRecord(a)
        if (m.hex) byHex.set(m.hex, m)
      }
    }

    const aircraft = [...byHex.values()]
    fetched = aircraft.length
    await saveTrails(aircraft)
    saved = aircraft.length
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
