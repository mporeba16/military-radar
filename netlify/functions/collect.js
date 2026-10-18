import { getStore, connectLambda } from '@netlify/blobs'
import { saveTrails } from './aircraft.js'
import { classifyADSBfi, isPlausibleRecord, isTrainingAircraft } from './lib/military.js'
import { fetchMilMerged, fetchAdsbfiGeo } from './lib/sources.js'

// Szeroki bounding box pokrywający Europę + zachodnia Rosja + bliski wschód
// (lat 30°-72°, lon -15°-50°). Listy /mil są globalne, więc i tak dostaniemy
// wszystko — filtr tylko żeby ograniczyć wagę zapisów.
const COLLECT_BBOX = { lamin: 30, lomin: -15, lamax: 72, lomax: 50 }

function isValidRecord(a) {
  // Maszyny na ziemi przechodzą — saveTrails je pomija, ale granica między
  // lotami (przerwa w trasie) bierze się właśnie z tego.
  if (!isPlausibleRecord(a)) return false
  if (a.lat < COLLECT_BBOX.lamin || a.lat > COLLECT_BBOX.lamax) return false
  if (a.lon < COLLECT_BBOX.lomin || a.lon > COLLECT_BBOX.lomax) return false
  // Samoloty szkolne nie trafiają na radar, więc nie ma po co zbierać ich tras.
  return !isTrainingAircraft(a.t)
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
    // Pozycja z MLAT bywa skokowa — saveTrails zapisuje ją rzadziej i z flagą.
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
    // Listy /mil (adsb.fi + adsb.lol, jak na mapie) i zapytanie geograficzne
    // nad Polską — dzięki niemu w tle zbieramy też trasy służbowych śmigłowców
    // i dużych samolotów (B747/An-124), których nie ma na listach /mil.
    const [milRes, geoRes] = await Promise.allSettled([fetchMilMerged(), fetchAdsbfiGeo()])
    const byHex = new Map()

    // /mil — zapisujemy całość (z definicji wojskowe)
    if (milRes.status === 'fulfilled') {
      for (const a of milRes.value.records) {
        if (!isValidRecord(a)) continue
        const m = mapRecord(a)
        if (m.hex) byHex.set(m.hex, m)
      }
      if (milRes.value.errors.length) error = milRes.value.errors.join('; ')
    } else {
      error = milRes.reason?.message
    }

    // Geo nad Polską — TYLKO maszyny, które aplikacja pokazuje (mil/heli/heavy),
    // żeby nie zapisywać tras całego ruchu cywilnego.
    if (geoRes.status === 'fulfilled') {
      for (const a of geoRes.value) {
        if (byHex.has((a.hex || '').toLowerCase())) continue
        if (!isValidRecord(a) || !classifyADSBfi(a)) continue
        const m = mapRecord(a)
        if (m.hex) byHex.set(m.hex, m)
      }
    } else {
      error = error ? `${error}; geo ${geoRes.reason?.message}` : `geo ${geoRes.reason?.message}`
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
