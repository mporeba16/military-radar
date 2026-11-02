// Jumbo jety i An-124 nad Polską i do 100 km od jej granic.
//
// Duże samoloty cywilne nie są w globalnym /mil, a zapytanie geograficzne
// adsb.fi sięga najwyżej 250 nm od środka Polski — za Szczecinem, Suwałkami
// i Bieszczadami pas 100 km od granicy wychodzi poza ten okrąg. adsb.lol ma
// pytanie po typie, globalne; zostawiamy z niego tylko maszyny blisko Polski
// (dalsze, np. nad Francją, nie są dla nas ciekawe). Pyta o nie wyłącznie
// cron `types-collect` na Cloudflare (co 5 minut), a `aircraft` czyta gotową migawkę
// z Blobs — ruch na stronie nie trafia do adsb.lol z tego powodu.

import { isNearPoland } from './poland.js'
import { WATCHED_TYPES } from '../../../src/lib/inbound.js'

export const HEAVY_STORE = 'heavy-europe'
export const HEAVY_KEY = 'snapshot'

// Te same typy co przyloty do Rzeszowa/Krakowa — obie migawki powstają
// z jednego pobrania (cloudflare/types-collect.js).
export const HEAVY_TYPES = WATCHED_TYPES

// Gdy typ dostał 429, jego maszyny przenosimy z poprzedniej migawki, dopóki
// pozycja nie jest starsza niż to — inaczej ikony by migały. Cron chodzi co
// 5 minut, więc poprzednia migawka ma zwykle ~5 min.
const CARRY_MAX_AGE_MS = 8 * 60 * 1000

// Ile km od granicy Polski maszyna jeszcze trafia do migawki.
export const NEAR_POLAND_KM = 100

// Starsza migawka (np. adsb.lol nie odpowiadał przez przebieg crona) nie trafia
// na mapę. Musi przetrwać odstęp między przebiegami (5 min) z zapasem.
export const HEAVY_MAX_AGE_MS = 8 * 60 * 1000
// Dalej niż tyle nie przesuwamy pozycji „w przód” — po tym czasie kurs mógł się
// zmienić. Pokrywa odstęp crona; jumbo jety w przelocie lecą zwykle prosto.
const MAX_EXTRAPOLATE_S = 360

export function inBox(a, box) {
  return typeof a.lat === 'number' && typeof a.lon === 'number' &&
    a.lat >= box.lamin && a.lat <= box.lamax && a.lon >= box.lomin && a.lon <= box.lomax
}

/**
 * Z globalnej listy typów (fetchAdsbLolTypes) zostawia maszyny nad Polską
 * i do NEAR_POLAND_KM od granicy. Każdy rekord dostaje `_at` — chwilę
 * pobrania, od której liczymy wiek pozycji.
 */
export function heaviesNearPoland(records, now = Date.now()) {
  return records
    .filter(a => a?.hex && isNearPoland(a.lat, a.lon, NEAR_POLAND_KM))
    .map(a => ({ ...a, _at: now }))
}

/** Dokłada z poprzedniej migawki maszyny typów, których teraz nie udało się pobrać (429). */
export function carryForward(current, fetchedTypes, previous, now = Date.now()) {
  const have = new Set(current.map(a => a.hex))
  const fetched = new Set(fetchedTypes)
  const kept = (previous?.aircraft || []).filter(a =>
    !have.has(a.hex) && !fetched.has(String(a.t || '').toUpperCase()) &&
    isNearPoland(a.lat, a.lon, NEAR_POLAND_KM) &&
    now - (a._at ?? previous.at) <= CARRY_MAX_AGE_MS)
  return [...current, ...kept]
}

/**
 * Przesuwa pozycję do „teraz” wg prędkości i kursu — rekord z adsb.lol bywa
 * sprzed minuty, a klient rysuje ikonę tam, gdzie dostał pozycję.
 */
export function extrapolate(a, ageS) {
  if (!(ageS > 0) || typeof a.gs !== 'number' || typeof a.track !== 'number' || a.alt_baro === 'ground') return a
  const s = Math.min(ageS, MAX_EXTRAPOLATE_S)
  const distNm = (a.gs * s) / 3600
  const rad = (a.track * Math.PI) / 180
  const dLat = (distNm * Math.cos(rad)) / 60
  const dLon = (distNm * Math.sin(rad)) / (60 * Math.cos((a.lat * Math.PI) / 180))
  return { ...a, lat: a.lat + dLat, lon: a.lon + dLon }
}

/**
 * Dokleja jumbo jety z migawki do listy na żywo: tylko te, których tam jeszcze
 * nie ma (nad Polską są świeższe dane z adsb.fi), tylko w obszarze zapytania.
 * `map` to ten sam mapper rekordów co dla adsb.fi.
 */
export function mergeHeavies(live, snapshot, box, map, now = Date.now()) {
  if (!snapshot?.aircraft?.length || !(now - snapshot.at <= HEAVY_MAX_AGE_MS)) return live
  const have = new Set(live.map(a => a.hex))
  const extra = []
  for (const raw of snapshot.aircraft) {
    const hex = String(raw.hex || '').toLowerCase()
    if (!hex || have.has(hex)) continue
    const fetchedAt = raw._at ?? snapshot.at
    if (now - fetchedAt > HEAVY_MAX_AGE_MS) continue
    const posAgeS = (now - fetchedAt) / 1000 + (typeof raw.seen_pos === 'number' ? raw.seen_pos : 0)
    const moved = extrapolate(raw, posAgeS)
    // Także tu, nie tylko w cronie: starsza migawka (sprzed zawężenia obszaru
    // albo przeniesiona przy 429) nie może wnieść maszyn znad Francji.
    if (!inBox(moved, box) || !isNearPoland(moved.lat, moved.lon, NEAR_POLAND_KM)) continue
    const { _at, ...rec } = moved
    extra.push(map({ ...rec, _kind: 'heavy' }))
    have.add(hex)
  }
  return extra.length ? [...live, ...extra] : live
}
