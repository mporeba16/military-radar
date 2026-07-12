// OpenSky Network API — darmowe, bez klucza (limit: ~100 req/10min dla anonimowych)
// Docs: https://openskynetwork.github.io/opensky-api/rest.html
//
// OpenSky nie ma flagi "military", więc filtrujemy po:
// 1. Znanych blokach ICAO przydzielonych wojsku (hex prefix)
// 2. Callsignach wojskowych (RCF, PLF, DUKE, JAKE, itp.)
// 3. Squawk kodach wojskowych (7777, 7400 itp.)

import { getStore, connectLambda } from '@netlify/blobs'
import { corsHeaders } from './lib/security.js'

const OPENSKY_USER = process.env.OPENSKY_USER || ''
const OPENSKY_PASS = process.env.OPENSKY_PASS || ''

// Środek geograficzny Polski — z promieniem 250nm (~463km) jedno zapytanie
// geograficzne adsb.fi pokrywa cały kraj wraz z pograniczem.
const POLAND_CENTER = { lat: '52.0', lon: '19.4' }

// Przybliżony obrys granic Polski (z niewielkim zapasem ~10–20 km na
// pogranicze/podejścia), [lat, lon] zgodnie z ruchem wskazówek zegara.
// Prostokąt nie wystarczał — łapał Kaliningrad i okolice Pragi/Lwowa, bo leżą
// w zakresie szer./dł. geogr. Polski. Wielokąt + test punktu to eliminuje.
const POLAND_POLY = [
  [54.6, 14.2],  // NW, wybrzeże (Świnoujście)
  [54.9, 16.3],  // wybrzeże środkowe
  [54.9, 18.9],  // Zatoka Gdańska
  [54.45, 20.6], // granica z Kaliningradem (poniżej miasta 54.7)
  [54.45, 22.9], // Suwałki / NE (granica z Litwą)
  [52.7, 23.9],  // wschód (granica z Białorusią, Białystok/Brześć)
  [50.8, 24.2],  // SE (granica z Ukrainą, Hrubieszów)
  [49.0, 22.9],  // SE róg (Bieszczady)
  [49.3, 19.8],  // południe (Tatry, granica ze Słowacją)
  [49.5, 18.5],  // południe (Cieszyn, granica z Czechami)
  [50.0, 17.0],  // SW (Opole/Nysa, Czechy)
  [50.6, 15.0],  // SW róg (Jelenia Góra)
  [51.0, 14.7],  // zachód (Zgorzelec/Görlitz)
  [52.8, 14.1],  // zachód (Odra, Słubice)
  [53.9, 14.1],  // NW (Szczecin)
]

// Test punktu w wielokącie (ray casting); lon = x, lat = y.
function isInPoland(lat, lon) {
  if (lat == null || lon == null) return false
  let inside = false
  for (let i = 0, j = POLAND_POLY.length - 1; i < POLAND_POLY.length; j = i++) {
    const yi = POLAND_POLY[i][0], xi = POLAND_POLY[i][1]
    const yj = POLAND_POLY[j][0], xj = POLAND_POLY[j][1]
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// Redukcja szumu: poza Polską pokazujemy tylko maszyny ze znanym kodem typu.
// Rekordy bez `t` to zwykle Mode-S / MLAT bez danych — masa kropek bez wartości.
// W Polsce pokazujemy wszystko (także bez typu), żeby nic lokalnie nie umknęło.
function passesTypeNoise(a) {
  if ((a.t || '').trim()) return true
  return isInPoland(a.lat, a.lon)
}

// Wspólny cache live-snapshotu (redukuje zapytania do adsb.fi → mniej 429)
const SNAPSHOT_TTL_MS = 9000

const TRAIL_MAX_AGE_MS = 4 * 60 * 60 * 1000  // 4 godziny historii
const TRAIL_MIN_INTERVAL_MS = 15_000           // min. 15s między punktami
// Gdy w trasie pojawia się przerwa dłuższa niż FLIGHT_SPLIT_GAP_MS, traktujemy
// to jako granicę między lotami (samolot wylądował i wystartował ponownie).
const FLIGHT_SPLIT_GAP_MS = 10 * 60 * 1000

// Returns only the points after the most recent gap >= FLIGHT_SPLIT_GAP_MS.
// Assumes input is sorted ascending by ts.
function currentFlightOnly(sortedPoints) {
  if (sortedPoints.length < 2) return sortedPoints
  let cutIndex = 0
  for (let i = 1; i < sortedPoints.length; i++) {
    if (sortedPoints[i].ts - sortedPoints[i - 1].ts > FLIGHT_SPLIT_GAP_MS) {
      cutIndex = i
    }
  }
  return sortedPoints.slice(cutIndex)
}

// Filters out points that would require an implausible ground speed to reach
// from the previous point — these are MLAT/coverage-gap glitches that show
// up as zigzags over open water. 2000 km/h is faster than any operational
// military aircraft, so legitimate fast turns / supersonic passes survive.
const TRAIL_MAX_PLAUSIBLE_KMH = 2000

function filterImplausibleJumps(sortedPoints) {
  if (sortedPoints.length < 2) return sortedPoints
  const result = [sortedPoints[0]]
  for (let i = 1; i < sortedPoints.length; i++) {
    const last = result[result.length - 1]
    const curr = sortedPoints[i]
    const dtHours = (curr.ts - last.ts) / 3600000
    // Only check when points are within a 30-min window — across larger
    // gaps the average implied speed is meaningless because the aircraft
    // may have been outside our sampling.
    if (dtHours > 0 && dtHours < 0.5) {
      const dx = (curr.lon - last.lon) * 111 * Math.cos(last.lat * Math.PI / 180)
      const dy = (curr.lat - last.lat) * 111
      const distKm = Math.sqrt(dx * dx + dy * dy)
      if (distKm / dtHours > TRAIL_MAX_PLAUSIBLE_KMH) continue
    }
    result.push(curr)
  }
  return result
}

// In-memory cache — survives across warm function invocations (eliminates per-aircraft blob reads)
const trailCache = new Map() // hex → { points, flight, t }

// Bloki ICAO hex używane do wykrywania wojska po SAMYM heksie. Tylko 'ae'
// (USAF/USN/USMC) jest blokiem WYŁĄCZNIE wojskowym i bezpiecznym. Europejskie
// "podbloki wojskowe" (43c, 49d, 48f, 47a…) okazały się błędne/mieszane —
// zawierają cywilne maszyny (np. czeski 737 OK-TVR w 49Dxxx pokazywał się jako
// wojskowy). Wojsko z tych krajów łapiemy przez /mil (adsb.fi taguje) oraz
// callsigny (PLF, GAF, FRAF, REACH…), więc heksowych podbloków nie używamy.
const MILITARY_HEX_PREFIXES = [
  'ae',  // USA — USAF / US Navy / USMC (blok wyłącznie wojskowy)
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
  /^GAF\d/i,  // German Air Force
  /^FRAF/i,   // French Air Force
  /^BAF\d/i,  // Belgian Air Force
  /^DAMP/i,   // Danish Air Force
  /^CZAF/i,   // Czech Air Force
  /^SLAF/i,   // Slovak Air Force
  /^HUNAF/i,  // Hungarian Air Force
  /^BUAF/i,   // Bulgarian Air Force
  /^ROTAF/i,  // Romanian Air Force
  /^FNY/i,    // Finnish Air Force (Ilmavoimat)
  /^FINAF/i,  // Finnish Air Force
  /^NRAF/i,   // Norwegian Air Force
  /^SWAF/i,   // Swedish Air Force
  /^LTAF/i,   // Lithuanian Air Force
  /^LVAF/i,   // Latvian Air Force
  /^EEAF/i,   // Estonian Air Force
  /^NATOQ/i,  // NATO Quick Reaction
  /^FORTE/i,  // USAF
  /^RAZER/i,  // USAF
  /^KNIFE/i,  // USAF
  /^ROCKY/i,  // USAF
  /^IRON/i,   // USAF
  /^SWORD/i,  // USAF
  /^VALOR/i,  // USAF
  /^HEAVY/i,  // USAF tankers
  /^SAVER/i,    // Norwegian Air Force (Luftforsvaret)
  /^EXPL/i,     // military exploration/reconnaissance helicopter
  /^RIMC/i,     // Italian military (Aeronautica Militare / Marina Militare)
  /^SRA/i,      // Saudi Royal Air Force
  /^SHAHD/i,    // Jordan Royal Air Force
  /^ZEUS/i,     // USAF
  /^BISON/i,    // USAF
  /^COLT/i,     // USAF
  /^ANVIL/i,    // USAF
  /^EAGLE\d/i,  // USAF (z cyfra — odróżnienie od Eagle Air)
  /^VIPER/i,    // USAF
  /^DEMON/i,    // USAF
  /^DRAGON\d/i, // NATO (z cyfra — odróżnienie od Dragonair)
  /^KNIGHT/i,   // USAF
  /^SHADOW/i,   // USAF ISR
  /^GHOST/i,    // USAF
  /^RAVEN/i,    // USAF
  /^STALLION/i, // USAF/USMC
  /^RANGER\d/i, // USAF (z cyfra — odróżnienie od Ranger Air)
  /^LANCE/i,    // NATO
  /^SHIELD/i,   // NATO
  /^TIGER\d/i,  // NATO (z cyfra — odróżnienie od Tiger Airways)
  /^VENOM/i,    // USAF
  /^SPECTRE/i,  // USAF AC-130
  /^SPOOKY/i,   // USAF AC-130
  /^PSYCHO/i,   // USAF
  /^JOLLY/i,    // USAF CSAR
  /^PEDRO/i,    // USAF CSAR
  /^KING\d/i,   // USAF tanker/CSAR (z cyfra — odróżnienie od King Airlines)
  /^PAVE/i,     // USAF special ops
  /^COMBAT/i,   // USAF
  /^BAH/i,      // Bahrain Amiri Air Force
  /^KAF/i,      // Kuwait Air Force
  /^QAF/i,      // Qatar Emiri Air Force
  /^OAF/i,      // Oman Royal Air Force
]

// Callsigny naziemnych stacji radarowych/sensorów MLAT — wyklucz zawsze
// (transmitują własną pozycję jak samolot, ale są stacjami naziemnymi)
const GROUND_STATION_PATTERNS = [
  /XCAM/i,  // ADS-B/MLAT ground sensor (np. 7777XCAM, XCAM01)
  /XCAT/i,  // ADS-B/MLAT ground sensor
  /XBAT/i,  // ADS-B/MLAT ground sensor
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

// ── Dodatkowe kategorie poza wojskiem ────────────────────────────────────
// Klasyfikacja działa tylko na danych adsb.fi (niosą kod typu `t`, rejestrację
// `r` i kategorię ADS-B `category`) — OpenSky tych pól nie zwraca, więc tam
// rozpoznajemy wyłącznie wojsko.
//   'heli'  — śmigłowiec służbowy (LPR / policja / Straż Graniczna / SAR)
//   'heavy' — duży/rzadki samolot (B747, An-124/225)

// Międzynarodowe callsigny służb ratowniczych/porządkowych
// LPR = Lotnicze Pogotowie Ratunkowe (polskie pogotowie lotnicze, callsign LPRxx)
const SERVICE_HELI_CALLSIGNS = /^(LPR|RATOWNIK|RESCUE|MEDIC|HEMS|LIFEGUARD|POLICE|POLICJA|STRAZ|SAR|REGA)/i
// Kody typów ICAO śmigłowców (uzupełnienie kategorii ADS-B A7)
const HELI_TYPE_RE = /^(EC|AS3|AS5|AS6|AW|A109|A119|A129|A139|A149|A169|A189|B0[0-9]|B4(07|12|27|29)|B505|B47|S6[14]|S70|S76|S92|H1(2[05]|3[05]|4[05]|55|60|75)|H47|H53|H60|UH|HH|MH|CH|AH|EH10|MD5|MD6|MI[0-9]|KA[0-9]|R22|R44|R66|BK11|BO10|W3|PZL|NH90|SA3|SH60)/

function normReg(r) { return (r || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }
function normType(t) { return (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }

function isRotorcraft(type, category) {
  if ((category || '').toUpperCase() === 'A7') return true
  return HELI_TYPE_RE.test(type)
}

// Służbowy śmigłowiec — wymagamy potwierdzenia, że to wirnikowiec (kategoria
// ADS-B A7 lub kod typu), bo prefiks SN- noszą też samoloty Straży Granicznej
// (M28), a SP-DX bywa lekkim samolotem. Kwalifikator „służbowy":
//   • PL LPR  — rejestracja SP-HX* / SP-DX* (callsign RATOWNIK)
//   • PL policja / Straż Graniczna — rejestracja SN-*
//   • międzynarodowe służby — callsign RESCUE/MEDIC/POLICE/SAR…
function isServiceHeli(reg, callsign, type, category) {
  if (!isRotorcraft(type, category)) return false
  if (/^SN/.test(reg)) return true
  if (/^SP(HX|DX)/.test(reg)) return true
  if (SERVICE_HELI_CALLSIGNS.test(callsign)) return true
  return false
}

// Duże / rzadkie samoloty warte pokazania: B747 (wszystkie warianty) i An-124/225.
function isNotableHeavy(type) {
  if (/^B74/.test(type)) return true            // 747 family (B741..B74S)
  if (/^A124$|^A225$/.test(type)) return true   // An-124 Rusłan / An-225 Mrija
  return false
}

// Antonov Airlines (ICAO "ADB") — niemal zawsze An-124 Rusłan (rzadziej An-225/An-22).
// Łapiemy po callsignie, bo typ z ADS-B bywa pusty/spóźniony lub przychodzi przez
// OpenSky bez pola typu — wtedy gubiliśmy alert o dużym samolocie. Ewentualny
// mniejszy Antonow na tym callsignie też jest rzadki i wart pokazania jako 'heavy'.
const ANTONOV_AIRLINES_CALLSIGN = /^ADB\d/

// Zwraca dodatkową kategorię ('heavy' | 'heli') lub null. Wojsko sprawdzamy
// osobno i ma priorytet (np. wojskowy B747 zostaje 'mil').
function classifyExtra(a) {
  const type = normType(a.t)
  if (isNotableHeavy(type)) return 'heavy'
  if (ANTONOV_AIRLINES_CALLSIGN.test((a.flight || '').trim().toUpperCase())) return 'heavy'
  if (isServiceHeli(normReg(a.r), (a.flight || '').trim(), type, a.category)) return 'heli'
  return null
}

// Odrzuć adresy ICAO które wyglądają na syntetyczne / testowe:
// - sekwencyjne bajty (np. 0x44-0x55-0x66, różnica stała) → fake/test
// - kończące się na 0xFFF → TIS-B synthetic (FAA/TC tymczasowe adresy)
// - wszystkie bajty identyczne (np. 0xAAAAAA)
function isSuspiciousHex(hex) {
  const n = parseInt(hex, 16)
  if (isNaN(n) || n === 0) return true
  const b1 = (n >> 16) & 0xFF
  const b2 = (n >> 8) & 0xFF
  const b3 = n & 0xFF
  if (b1 === b2 && b2 === b3) return true           // 0xAAAAAA
  if (b2 - b1 === b3 - b2 && b1 !== b2) return true // 0x445566
  if ((n & 0xFFF) === 0xFFF) return true             // 0xC2BFFF
  return false
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

// OpenSky state vector indeksy:
// 0:icao24, 1:callsign, 2:origin_country, 3:time_position, 4:last_contact,
// 5:longitude, 6:latitude, 7:baro_altitude, 8:on_ground, 9:velocity,
// 10:true_track, 11:vertical_rate, 12:sensors, 13:geo_altitude,
// 14:squawk, 15:spi, 16:position_source
function stateToAircraft(s) {
  return {
    hex: (s[0] || '').toLowerCase(),
    flight: (s[1] || '').trim() || s[0],
    t: '',          // OpenSky nie zwraca typu — uzupełniamy jeśli mamy
    lat: s[6],
    lon: s[5],
    alt_baro: s[7] != null ? Math.round(s[7] * 3.28084) : null, // m → ft
    gs: s[9] != null ? Math.round(s[9] * 1.94384) : null,       // m/s → kn
    track: s[10] != null ? Math.round(s[10]) : null,
    baro_rate: s[11] != null ? Math.round(s[11] * 196.85) : null, // m/s → ft/min
    squawk: s[14] || null,
    reg: null,
    country: s[2],
    on_ground: s[8],
    kind: 'mil',  // OpenSky nie ma typu/rejestracji — rozpoznajemy tylko wojsko
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
      .filter(s => s[5] != null && s[6] != null && !s[8] && (s[7] == null || s[7] <= 18300) && !isSuspiciousHex(s[0]) && isMilitary(s))
      .map(stateToAircraft)
    return { aircraft: military, _source: 'opensky' }
  } catch {
    return null
  }
}

function mapADSBfiRecord(a) {
  // Używamy WYŁĄCZNIE realnej pozycji (a.lat/a.lon) — pokrywa to ADS-B oraz
  // wyliczony MLAT. NIE schodzimy do rr_lat/rr_lon (rough receiver) — to tylko
  // lokalizacja odbiornika, potrafiąca być oddalona o dziesiątki km od maszyny
  // (powodowała „odskok" ikony od trasy). Rekordy bez realnej pozycji są
  // odsiewane już w isADSBfiRecordInBox — maszyna znika z radaru, dopóki nie
  // odzyska własnego fixa (zamiast pokazywać ją w przybliżonym miejscu).
  return {
    hex: (a.hex || '').toLowerCase(),
    flight: (a.flight || a.hex || '').trim(),
    t: a.t || '',
    lat: a.lat,
    lon: a.lon,
    alt_baro: (a.alt_baro != null && a.alt_baro !== 'ground') ? a.alt_baro : null,
    gs: a.gs != null ? Math.round(a.gs) : null,
    track: a.track != null ? Math.round(a.track) : null,
    baro_rate: a.baro_rate != null ? Math.round(a.baro_rate) : null,
    squawk: a.squawk || null,
    reg: a.r || null,
    country: '',
    on_ground: a.alt_baro === 'ground' || !!a.on_ground,
    // MLAT-derived position (adsb.fi oznacza pola wyliczone w tablicy `mlat`) —
    // bywa skokowy, więc pomijamy go przy zapisie trasy (saveTrails), ale rysujemy.
    mlat: Array.isArray(a.mlat) && a.mlat.length > 0,
    kind: a._kind || 'mil',
  }
}

const GROUND_STATION_TYPES = new Set(['TWR', 'GND', 'MLAT', 'RADAR'])

function isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax) {
  // Wymagamy REALNEJ pozycji (ADS-B lub wyliczony MLAT). Rekordy mające tylko
  // rr_lat/rr_lon (rough receiver) odrzucamy — to lokalizacja odbiornika, nie
  // maszyny, i powodowała odskoki ikony. Bez własnego fixa maszyna znika.
  const lat = a.lat
  const lon = a.lon
  const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
  if (GROUND_STATION_TYPES.has((a.t || '').toUpperCase())) return false
  if (GROUND_STATION_TYPES.has((a.r || '').toUpperCase())) return false
  // Allow on_ground / alt_baro === 'ground' — they render as gray icons.
  // Trail saving still skips them in saveTrails.
  return lat != null && lon != null &&
    lat >= lamin && lat <= lamax &&
    lon >= lomin && lon <= lomax &&
    (alt == null || (alt >= 0 && alt <= 60000)) &&
    !isSuspiciousHex(a.hex)
}

function isMilitaryADSBfi(a) {
  const hex = (a.hex || '').toLowerCase()
  const callsign = (a.flight || '').trim()
  const squawk = a.squawk || ''
  if (GROUND_STATION_PATTERNS.some(re => re.test(callsign))) return false
  if (CIVILIAN_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return false
  if (MILITARY_HEX_PREFIXES.some(p => hex.startsWith(p))) return true
  if (MILITARY_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return true
  if (MILITARY_SQUAWKS.has(squawk)) return true
  return false
}

// adsb.fi — publiczne API, działa z serverless, pokrywa Europę.
// Oprócz globalnego /mil robimy zapytanie geograficzne wycentrowane na Polsce,
// żeby złapać maszyny nieoznaczone w bazie /mil (wojsko po callsignie/hex,
// służbowe śmigłowce, duże samoloty).
async function tryADSBfi(lamin, lomin, lamax, lomax) {
  try {
    const headers = { 'User-Agent': 'MilitaryRadarPL/1.0', 'Accept': 'application/json' }

    // Zapytanie 1: globalny endpoint /mil (baza adsb.fi)
    const milRes = await fetch('https://opendata.adsb.fi/api/v2/mil', {
      signal: AbortSignal.timeout(10000), headers
    })
    if (!milRes.ok) return null
    const milData = await milRes.json()
    const milAircraft = (milData.ac || []).filter(a =>
      isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax) && passesTypeNoise(a))
    milAircraft.forEach(a => { a._kind = 'mil' })
    const milHexes = new Set(milAircraft.map(a => a.hex))

    // Zapytanie 2: supplement geograficzny — łapie maszyny nieoznaczone w bazie
    // adsb.fi /mil: wojskowe (po hex/callsign), służbowe śmigłowce oraz duże
    // samoloty (B747/An-124). adsb.fi obsługuje max 250nm (~463km) — centrujemy
    // na środku Polski, by jednym zapytaniem pokryć cały kraj (Kraków, Rzeszów).
    let supplementAircraft = []
    {
      const radiusNm = 250
      try {
        const geoUrl = `https://opendata.adsb.fi/api/v2/lat/${POLAND_CENTER.lat}/lon/${POLAND_CENTER.lon}/dist/${radiusNm}`
        let geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000), headers })
        // adsb.fi limituje ~1 req/s, a /mil i geo lecą tuż po sobie — drugie
        // (geo) często dostaje 429. Odczekaj chwilę i spróbuj raz jeszcze.
        if (geoRes.status === 429) {
          await new Promise(r => setTimeout(r, 1200))
          geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(6000), headers })
        }
        if (geoRes.ok) {
          const geoData = await geoRes.json()
          supplementAircraft = (geoData.aircraft || geoData.ac || []).filter(a => {
            if (!isADSBfiRecordInBox(a, lamin, lomin, lamax, lomax)) return false
            if (!passesTypeNoise(a)) return false
            if (milHexes.has(a.hex)) return false
            if (isMilitaryADSBfi(a)) { a._kind = 'mil'; return true }
            const extra = classifyExtra(a)
            if (extra) { a._kind = extra; return true }
            return false
          })
        }
      } catch { /* supplement is best-effort */ }
    }

    const ac = [...milAircraft, ...supplementAircraft].map(mapADSBfiRecord)
    return { aircraft: ac, _source: 'adsbfi' }
  } catch {
    return null
  }
}

export const handler = async (event) => {
  connectLambda(event)
  const headers = corsHeaders(event)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  const params = event.queryStringParameters || {}
  const { lat, lon, radius, hex } = params

  // Tryb pobierania trasy konkretnego samolotu — czytamy z naszego bloba.
  // Trasa rośnie podczas:
  //   - aktywnego pollingu klienta (co 5 s, próbka 15 s)
  //   - scheduled `collect` cron (co 2 min, w tle)
  // saveTrails pomija on_ground, więc przerwa > FLIGHT_SPLIT_GAP_MS w danych
  // odpowiada okresowi na ziemi (lub utracie zasięgu ADS-B) — traktujemy ją
  // jako granicę między lotami i zwracamy TYLKO bieżący lot.
  if (hex) {
    // `hex` becomes a blob store key — reject anything that isn't a real
    // 6-digit ICAO address so a crafted value can't probe the store.
    if (!/^[0-9a-f]{6}$/i.test(hex)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nieprawidłowy hex' }) }
    }
    const lowerHex = hex.toLowerCase()
    let blobError = null
    let allPoints = []
    try {
      const data = await getStore('aircraft-trails').get(lowerHex, { type: 'json' })
      allPoints = data?.points || []
    } catch (err) {
      blobError = err.message
    }

    allPoints.sort((a, b) => a.ts - b.ts)
    // Cap to most-recent N points so a 4-hour flight doesn't return 50 KB
    // of JSON on every refresh — visual fidelity from 500 polyline vertices
    // is plenty for any realistic flight.
    const TRAIL_RESPONSE_MAX_POINTS = 500
    const currentFlight = filterImplausibleJumps(currentFlightOnly(allPoints))
      .slice(-TRAIL_RESPONSE_MAX_POINTS)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        trail: currentFlight,
        sources: {
          blob: currentFlight.length,
          blobTotal: allPoints.length,
          blobError,
          blobFirstTs: currentFlight[0]?.ts || null,
          blobLastTs: currentFlight[currentFlight.length - 1]?.ts || null,
        },
      }),
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

  // Cache odpowiedzi: klienci odpytują co 5 s, a adsb.fi limituje ~1 req/s —
  // bez cache zapytanie geo (drugie po /mil) ciągle dostaje 429 i znikają
  // helikoptery/heavy. Trzymamy wspólny snapshot ~9 s, więc adsb.fi jest pytane
  // najwyżej raz na ~9 s niezależnie od liczby klientów.
  const snapKey = `live-${latN.toFixed(2)}_${lonN.toFixed(2)}_${radiusKm}`
  let snapStore = null
  try { snapStore = getStore('aircraft-snapshot') } catch {}
  if (snapStore) {
    try {
      const cached = await snapStore.get(snapKey, { type: 'json' })
      if (cached && Date.now() - cached.ts < SNAPSHOT_TTL_MS && cached.source !== 'unavailable') {
        return { statusCode: 200, headers, body: JSON.stringify({ aircraft: cached.aircraft, _source: cached.source, _cached: true }) }
      }
    } catch { /* brak cache → pobierz świeżo */ }
  }

  const result = await tryADSBfi(lamin, lomin, lamax, lomax)
    || await tryOpenSky(lamin, lomin, lamax, lomax)
    || { aircraft: [], _source: 'unavailable' }

  if (snapStore && result._source !== 'unavailable') {
    await snapStore.set(snapKey, JSON.stringify({ ts: Date.now(), aircraft: result.aircraft, source: result._source })).catch(() => {})
  }

  await Promise.race([saveTrails(result.aircraft).catch(() => {}), new Promise(r => setTimeout(r, 3000))])

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(result)
  }
}

export async function saveTrails(aircraft) {
  if (!aircraft?.length) return
  const store = getStore('aircraft-trails')
  const now = Date.now()

  // Load from blob only for aircraft not yet in the in-memory cache (cold start / new aircraft)
  const uncached = aircraft.filter(ac => ac.lat != null && ac.lon != null && !trailCache.has(ac.hex))
  await Promise.allSettled(uncached.map(async ac => {
    let existing = null
    try { existing = await store.get(ac.hex, { type: 'json' }) } catch {}
    trailCache.set(ac.hex, {
      points: (existing?.points || []).filter(p => now - p.ts < TRAIL_MAX_AGE_MS),
      flight: ac.flight,
      t: ac.t,
    })
  }))

  // Determine which aircraft need a new trail point written.
  // Grounded aircraft are skipped — their gap in the trail data is what
  // lets us detect the boundary between flights server-side. MLAT-only
  // positions (no real ADS-B fix, only receiver-rough estimate) are noisy
  // and would cause zigzag artifacts — skip them too.
  const toWrite = []
  for (const ac of aircraft) {
    if (ac.lat == null || ac.lon == null) continue
    if (ac.on_ground) continue
    if (ac.mlat) continue
    const entry = trailCache.get(ac.hex)
    if (!entry) continue
    entry.points = entry.points.filter(p => now - p.ts < TRAIL_MAX_AGE_MS)
    const last = entry.points[entry.points.length - 1]
    if (!last || now - last.ts >= TRAIL_MIN_INTERVAL_MS) {
      entry.points.push({ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro, ts: now })
      entry.flight = ac.flight
      entry.t = ac.t
      toWrite.push(ac.hex)
    }
  }

  // Write only those that changed (parallel)
  await Promise.allSettled(toWrite.map(hex =>
    store.set(hex, JSON.stringify(trailCache.get(hex)))
  ))
}

