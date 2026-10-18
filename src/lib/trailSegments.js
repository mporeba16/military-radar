// Linia trasy zaznaczonej maszyny: punkty z serwera (cron co 2 min) i z
// aplikacji (co 10 s) sklejone w odcinki w kolorze wysokości.
import { altToColor, ftToM } from '../components/aircraftShapes'
import { filterMlatSpikes } from './trailFilter.js'

// Trail rendering: don't draw a polyline segment across a gap larger than
// this (e.g. signal loss over open water). The two real points stay at
// their true positions; the bogus straight bridge between them does not.
const TRAIL_VISUAL_GAP_MS = 3 * 60 * 1000

// T2: drop a point if there is another within DIST_M metres AND TIME_MS milliseconds.
// Client samples at ~15 s, server cron at ~120 s, so timestamps almost never
// match exactly — proximity-based dedup avoids zigzags from overlapping points.
const TRAIL_DEDUP_DIST_KM = 0.05
const TRAIL_DEDUP_TIME_MS = 30_000
function dedupTrailPoints(sortedPoints) {
  const out = []
  for (const p of sortedPoints) {
    const last = out[out.length - 1]
    if (last) {
      const dt = p.ts - last.ts
      if (dt >= 0 && dt < TRAIL_DEDUP_TIME_MS) {
        const dx = (p.lon - last.lon) * 111 * Math.cos(last.lat * Math.PI / 180)
        const dy = (p.lat - last.lat) * 111
        if (Math.sqrt(dx * dx + dy * dy) < TRAIL_DEDUP_DIST_KM) continue
      }
    }
    out.push(p)
  }
  return out
}

/**
 * Odcinki trasy do narysowania i punkt startu (zielona kropka — kierunek
 * widać od razu). Punkty sortujemy i odsiewamy duplikaty oraz odskoki MLAT,
 * dokładamy bieżącą pozycję maszyny (żeby linia do niej dochodziła), a potem
 * kleimy kolejne punkty tego samego koloru w jeden odcinek. Przerwa dłuższa
 * niż TRAIL_VISUAL_GAP_MS (utrata sygnału) zaczyna nowy odcinek bez mostu —
 * inaczej trasa pokazywałaby długą prostą przez czas bez danych.
 */
export function buildTrailSegments(hex, serverPts, clientPts, current, now = Date.now()) {
  let all = [...serverPts, ...clientPts].sort((a, b) => a.ts - b.ts)
  all = filterMlatSpikes(dedupTrailPoints(all))

  if (current && current.lat != null && current.lon != null) {
    const last = all[all.length - 1]
    if (!last || now - last.ts > 5000) {
      all.push({ lat: current.lat, lon: current.lon, alt: current.alt_baro, ts: now })
    }
  }
  if (all.length < 2) return { segments: null, start: null }

  const segments = []
  let curColor = null
  let curPositions = null
  let lastPt = null
  const flush = () => {
    if (curPositions && curPositions.length >= 2) {
      segments.push({ key: `seg-${hex}-${segments.length}`, color: curColor, positions: curPositions })
    }
  }
  for (const pt of all) {
    const c = altToColor(ftToM(pt.alt))
    const ll = [pt.lat, pt.lon]
    if (lastPt && pt.ts - lastPt.ts > TRAIL_VISUAL_GAP_MS) {
      // Koniec odcinka, następny od zera — BEZ mostu.
      flush()
      curPositions = [ll]
      curColor = c
    } else if (c === curColor) {
      curPositions.push(ll)
    } else {
      flush()
      // Zmiana koloru — most od poprzedniego punktu, żeby linia była ciągła.
      curPositions = curPositions && curPositions.length > 0
        ? [curPositions[curPositions.length - 1], ll]
        : [ll]
      curColor = c
    }
    lastPt = pt
  }
  flush()
  return { segments, start: { lat: all[0].lat, lon: all[0].lon } }
}
