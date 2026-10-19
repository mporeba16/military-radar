// Klasyfikacja maszyn (wojskowe, służbowe śmigłowce, duże samoloty) — wspólna
// dla mapy, tras i powiadomień. Pobieranie danych mieszka w sources.js.

// Tylko 'ae' (US military) jest blokiem wyłącznie wojskowym. Europejskie
// "podbloki" były błędne/mieszane (cywilne false-positivy) — patrz aircraft.js.
const MILITARY_HEX_PREFIXES = [
  'ae',  // USA — USAF / US Navy / USMC
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

// ── Samoloty szkolne ──────────────────────────────────────────────────────
// Maszyny treningowe latają w kółko nad własnym lotniskiem po kilka godzin
// dziennie i zapychają radar zdarzeniami, które nic nie znaczą: PZL-130 Orlik
// z Dęblina potrafi siedzieć na mapie cały dzień, robiąc kręgi nad Radomiem.
// To jedyna rzecz w tej aplikacji odsiewana dlatego, że jest NUDNA, a nie
// dlatego, że jest błędna — stąd osobna, jawna lista zamiast reguły.
//
// Hawk był tu wcześniej świadomie zostawiony jako szkolno-bojowy, ale
// użytkownika nie interesuje (19.10.2026) — tak samo TBM-700/900, które
// w lotnictwach wojskowych służą do łącznikowania i szkolenia nawigatorów.
// M-346 Bielik, L-39, TS-11 i T-38 zostają: to decyzja użytkownika, nie reguła.
const TRAINING_TYPES = new Set([
  'PZ3T',          // PZL-130 Orlik — Dęblin / Radom
  'G115',          // Grob G115 Tutor — brytyjskie loty zapoznawcze
  'G120', 'G12T',  // Grob G120 / G120TP
  'PC21', 'PC9', 'PC7', // Pilatus PC-21 / PC-9 / PC-7
  'TEX2', 'T6',    // Beechcraft T-6 Texan II (TEX2 w danych; T6 to stary kod)
  'HAWK',          // BAE Hawk / T-45 Goshawk
  'TBM7', 'TBM8', 'TBM9', // SOCATA TBM 700/850/900 — łącznikowe
  'TUCA',          // Embraer Tucano
  'SR20',          // Cirrus T-53A — akademia USAF
  'DA40', 'DA42', 'DV20', // Diamond — szkolenie podstawowe i nawigacyjne
  'Z42', 'GLIM', 'SF26', // Zlin 242, motoszybowce i szybowce szkolne
])

export function isTrainingAircraft(type) {
  return TRAINING_TYPES.has(normType(type))
}

// Znak wywoławczy, który jest po prostu rejestracją maszyny — tak latają
// prywatne awionetki. Wtedy wzorce znaków wojskowych nie mają sensu: ultralekki
// VL3 SP-OOKY nadaje „SPOOKY", czyli znak gunshipa AC-130, i trafiał na radar
// jako wojsko (tak samo groziłoby to np. niemieckiemu D-EMON jako „DEMON").
// Rejestrację bierzemy z bazy (pole `r`), a gdy jej brak (adsb.lol, OpenSky) —
// dla polskiej puli adresów (488000–48FFFF) rozpoznajemy wzór SPxxxx.
function callsignIsRegistration(hex, callsign, reg) {
  const cs = callsign.toUpperCase()
  if (!cs) return false
  if (reg && cs === reg.replace(/-/g, '').toUpperCase()) return true
  const n = parseInt(hex, 16)
  return n >= 0x488000 && n <= 0x48FFFF && /^SP[A-Z]{4}$/.test(cs)
}

const GROUND_STATION_PATTERNS = [/XCAM/i, /XCAT/i, /XBAT/i]
export const GROUND_STATION_TYPES = new Set(['TWR', 'GND', 'MLAT', 'RADAR'])
const MILITARY_SQUAWKS = new Set(['7777', '7400'])

// ── Dodatkowe kategorie poza wojskiem (patrz aircraft.js — trzymane w synchronie) ──
//   'heli'  — śmigłowiec służbowy (LPR / policja / Straż Graniczna / SAR)
//   'heavy' — duży/rzadki samolot (B747, An-124/225)
// LPR = Lotnicze Pogotowie Ratunkowe (polskie pogotowie lotnicze, callsign LPRxx)
const SERVICE_HELI_CALLSIGNS = /^(LPR|RATOWNIK|RESCUE|MEDIC|HEMS|LIFEGUARD|POLICE|POLICJA|STRAZ|SAR|REGA)/i
const HELI_TYPE_RE = /^(EC|AS3|AS5|AS6|AW|A109|A119|A129|A139|A149|A169|A189|B0[0-9]|B4(07|12|27|29)|B505|B47|S6[14]|S70|S76|S92|H1(2[05]|3[05]|4[05]|55|60|75)|H47|H53|H60|UH|HH|MH|CH|AH|EH10|MD5|MD6|MI[0-9]|KA[0-9]|R22|R44|R66|BK11|BO10|W3|PZL|NH90|SA3|SH60)/

function normReg(r) { return (r || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }
function normType(t) { return (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }

function isRotorcraft(type, category) {
  if ((category || '').toUpperCase() === 'A7') return true
  return HELI_TYPE_RE.test(type)
}

function isServiceHeli(reg, callsign, type, category) {
  if (!isRotorcraft(type, category)) return false
  if (/^SN/.test(reg)) return true
  if (/^SP(HX|DX)/.test(reg)) return true
  if (SERVICE_HELI_CALLSIGNS.test(callsign)) return true
  return false
}

function isNotableHeavy(type) {
  if (/^B74/.test(type)) return true
  if (/^A124$|^A225$/.test(type)) return true
  return false
}

// Antonov Airlines (ICAO "ADB") — niemal zawsze An-124 Rusłan (rzadziej An-225/An-22).
// Łapiemy po callsignie, bo typ z ADS-B bywa pusty/spóźniony lub przychodzi przez
// OpenSky bez pola typu — wtedy gubiliśmy alert o dużym samolocie. Ewentualny
// mniejszy Antonow na tym callsignie też jest rzadki i wart pokazania jako 'heavy'.
const ANTONOV_AIRLINES_CALLSIGN = /^ADB\d/

// Zwraca dodatkową kategorię ('heavy' | 'heli') lub null (wojsko ma priorytet).
export function classifyExtra(a) {
  const type = normType(a.t)
  if (isNotableHeavy(type)) return 'heavy'
  if (ANTONOV_AIRLINES_CALLSIGN.test((a.flight || '').trim().toUpperCase())) return 'heavy'
  if (isServiceHeli(normReg(a.r), (a.flight || '').trim(), type, a.category)) return 'heli'
  return null
}

// ── Kategorie wybierane przez użytkownika ─────────────────────────────────
// Przełączniki w aplikacji filtrują mapę I powiadomienia, więc klient, zapis
// subskrypcji i wysyłka muszą czytać ten sam kształt. Wyłącza wyłącznie jawne
// `false`: brak pola albo śmieci znaczą „wszystko włączone", żeby rekord
// zapisany starszą wersją klienta nie wyciszył komuś alertów po deployu.
// `rare` nie jest kategorią na mapie, tylko przełącznikiem powiadomień
// o rzadkich maszynach nad Polską — jedzie tym samym obiektem `kinds`.
export const KIND_KEYS = ['mil', 'heli', 'heavy', 'rare']

export function normalizeKinds(v) {
  const out = {}
  for (const k of KIND_KEYS) out[k] = !(v && typeof v === 'object' && v[k] === false)
  return out
}

export function isSuspiciousHex(hex) {
  const n = parseInt(hex, 16)
  if (isNaN(n) || n === 0) return true
  const b1 = (n >> 16) & 0xFF
  const b2 = (n >> 8) & 0xFF
  const b3 = n & 0xFF
  if (b1 === b2 && b2 === b3) return true
  if (b2 - b1 === b3 - b2 && b1 !== b2) return true
  if ((n & 0xFFF) === 0xFFF) return true
  // Adresy kończące się na 000 to początki bloków ICAO przydzielonych krajom
  // (480000 = start puli holenderskiej) — praktycznie nigdy nie przypisywane
  // maszynie, za to chętnie używane jako wartość domyślna. Przez taki rekord
  // trafiał do nas „SPOTR": MLAT zgadł znak wywoławczy, doczepił go do 480000,
  // a baza adsb.fi na tym adresie ma cywilnego Fokkera 70 (PH-KZH) i flagę
  // wojskową — czyli sam feed /mil podawał nam śmieć. Pomiar na żywym ruchu:
  // w 435 rekordach /mil i 270 nad Polską taki adres miał DOKŁADNIE ten jeden
  // rekord, więc reguła nie zabiera niczego prawdziwego. Symetryczna do FFF wyżej.
  if ((n & 0xFFF) === 0x000) return true
  return false
}

export function isMilitaryADSBfiRecord(a) {
  if (isTrainingAircraft(a.t)) return false
  const hex = (a.hex || '').toLowerCase()
  const callsign = (a.flight || '').trim()
  const squawk = a.squawk || ''
  if (GROUND_STATION_PATTERNS.some(re => re.test(callsign))) return false
  if (CIVILIAN_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return false
  if (MILITARY_HEX_PREFIXES.some(p => hex.startsWith(p))) return true
  // Flaga wojskowa z bazy adsb.fi (dbFlags bit 1) — ta sama, z której
  // powstaje lista /mil. W zapytaniu geograficznym przychodzi przy rekordzie,
  // a bez niej wojsko bez wojskowego znaku (francuski MRTT TTAL91, litewski
  // C-27J LYF275) zależało wyłącznie od tego, czy trafi na listę /mil.
  if (a.dbFlags & 1) return true
  if (!callsignIsRegistration(hex, callsign, a.r) &&
    MILITARY_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return true
  if (MILITARY_SQUAWKS.has(squawk)) return true
  return false
}

// Klasyfikacja rekordu adsb.fi do kategorii pokazywanych w aplikacji
// (te same reguły co w aircraft.js). Zwraca 'mil' | 'heli' | 'heavy' | null.
export function classifyADSBfi(a) {
  if (isMilitaryADSBfiRecord(a)) return 'mil'
  return classifyExtra(a)
}

// OpenSky state-vector form (array indices) of the military test.
export function isMilitaryState(ac) {
  const hex = (ac[0] || '').toLowerCase()
  const callsign = (ac[1] || '').trim()
  const squawk = ac[14] != null ? String(ac[14]).padStart(4, '0') : ''
  if (GROUND_STATION_PATTERNS.some(re => re.test(callsign))) return false
  if (CIVILIAN_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return false
  if (MILITARY_HEX_PREFIXES.some(p => hex.startsWith(p))) return true
  if (!callsignIsRegistration(hex, callsign, null) &&
    MILITARY_CALLSIGN_PATTERNS.some(re => re.test(callsign))) return true
  if (MILITARY_SQUAWKS.has(squawk)) return true
  return false
}

// Wspólne sito rekordów readsb (adsb.fi/adsb.lol) dla mapy, tras
// i powiadomień: realna pozycja (bez rr_lat/rr_lon — to lokalizacja
// odbiornika, nie maszyny), bez stacji naziemnych, bez wysokości spoza
// zakresu i bez hexów-widm. Maszyny na ziemi przechodzą — mapa rysuje je na
// szaro, a o tym, czy trafią do tras lub alertów, decyduje wołający.
export function isPlausibleRecord(a) {
  if (GROUND_STATION_TYPES.has((a.t || '').toUpperCase())) return false
  if (GROUND_STATION_TYPES.has((a.r || '').toUpperCase())) return false
  const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
  if (alt != null && (alt < 0 || alt > 60000)) return false
  if (isSuspiciousHex(a.hex)) return false
  return a.lat != null && a.lon != null
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

