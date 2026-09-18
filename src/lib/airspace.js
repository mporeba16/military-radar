// Strefy z planu użytkowania przestrzeni (AUP/UUP) PAŻP — logika wspólna dla
// funkcji serwera (co zostawić) i mapy (jak opisać). Czyste funkcje, bez sieci.
//
// Źródło: publiczna mapa airspace.pansa.pl. To nie jest udokumentowane API,
// tylko dane, z których korzysta ta mapa — kształt może się zmienić bez
// zapowiedzi, więc wszystko tutaj ma przeżyć brak pola.

// Typy struktur, które mogą nieść wojsko. ATZ to strefy lotnisk (w AUP prawie
// wyłącznie aerokluby: szybowce, skoki), NPZ to strefa bez znaczenia dla nas.
export const ZONE_TYPES = new Set(['TSA', 'TRA', 'D', 'R', 'MRT', 'ADHOC'])

// Jednostki rezerwujące, które oznaczają wojsko niezależnie od lotniska.
// COP — Centrum Operacji Powietrznych, OAT — ruch operacyjny (wojskowy).
// Straż Graniczna (ZZSG) rezerwuje wyłącznie strefy dla dronów — pomijamy.
const MIL_UNITS = new Set(['MIL', 'OAT', 'COP'])

// Strefy dla dronów (BSP/UAV) nie interesują użytkownika (decyzja
// użytkownika): to kilkadziesiąt całodobowych pasów przy wschodniej granicy,
// a aplikacja pokazuje załogowe maszyny.
const DRONE_TOKENS = /(^|[/\s])(BSP|UAV|UAS)([/\s]|$)/i

export function isDroneReservation(r) {
  return DRONE_TOKENS.test(r?.remarks || '')
}

// Lotniska, z których latają wojskowe szkoły i śmigłowce, choć nie ma ich na
// warstwie baz: Radom (Orliki, M-346), Leźnica Wielka (Mi-8, Mi-17).
const EXTRA_MIL_ICAO = ['EPRA', 'EPLY']

export function milUnitSet(milBases) {
  return new Set([...milBases.map(b => b.icao), ...EXTRA_MIL_ICAO])
}

export function isMilitaryReservation(r, milIcao) {
  const unit = (r?.unit || '').toUpperCase()
  if (isDroneReservation(r)) return false
  return MIL_UNITS.has(unit) || milIcao.has(unit)
}

// Rezerwacja na pół doby i dłużej (typowo 06:00–06:00 albo 06:00–23:59) to
// blok „na wszelki wypadek”, a nie zaplanowane loty — nie mówi, że coś się
// dzieje. Loty szkolne rezerwują strefę na 1–4 godziny.
const ALL_DAY_MS = 12 * 60 * 60 * 1000
export function isAllDay(r) {
  return r.e - r.s >= ALL_DAY_MS
}

// Pułap z AUP: „GND”, „A035” (wysokość 3500 ft), „F095” (poziom lotu 95,
// czyli 9500 ft na ciśnieniu standardowym). Zwraca metry lub null.
export function altToMetres(code) {
  if (!code) return null
  const c = String(code).trim().toUpperCase()
  if (c === 'GND' || c === 'SFC') return 0
  const m = c.match(/^([AF])(\d{3})$/)
  if (!m) return null
  return Math.round(Number(m[2]) * 100 * 0.3048)
}

function roundAlt(m) {
  return m < 1000 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50
}

export function formatAltRange(lo, hi) {
  const a = altToMetres(lo)
  const b = altToMetres(hi)
  if (a == null || b == null) return `${lo || '?'}–${hi || '?'}`
  const fmt = v => roundAlt(v).toLocaleString('pl-PL')
  return `${fmt(a)}–${fmt(b)} m`
}

// Uwagi rezerwacji to skrótowiec: „F35/CLN/W”, „HUSAR/W”,
// „NOT.D6513/26/ORZEL”. Zostawiamy to, co mówi, KTO lata: typy maszyn
// i nazwy ćwiczeń. Odrzucamy znaczniki proceduralne (W, CLN), numery NOTAM
// i suplementów AIP.
const TYPE_NAMES = {
  F35: 'F-35', F16: 'F-16', M346: 'M-346', MG29: 'MiG-29', KC135: 'KC-135',
  KC46: 'KC-46', C130: 'C-130', C295: 'C-295', M28: 'M28', PZL130: 'PZL-130',
  MI2: 'Mi-2', MI8: 'Mi-8', MI17: 'Mi-17', MI24: 'Mi-24', SW4: 'SW-4',
  W3: 'W-3', AW101: 'AW101', AH64: 'AH-64', UH60: 'UH-60', DA20: 'DA20',
  C150: 'C150', A10: 'A-10', F15: 'F-15', F18: 'F-18', EF2000: 'Eurofighter',
}
const DROP = /^(W|CLN|OATC|DS|NOT\..*|SUP\d+|\d+|ACSL|LAW)$/

export function describeRemarks(remarks) {
  if (!remarks) return []
  const out = []
  for (const raw of String(remarks).toUpperCase().split(/[/\s,]+/)) {
    const tok = raw.trim()
    if (!tok || DROP.test(tok)) continue
    const name = TYPE_NAMES[tok] || tok
    if (!out.includes(name)) out.push(name)
  }
  return out
}

export const TYPE_LABELS = {
  TSA: 'strefa wydzielona (TSA)',
  TRA: 'strefa zarezerwowana (TRA)',
  D: 'strefa niebezpieczna (D)',
  R: 'strefa ograniczeń (R)',
  MRT: 'trasa wojskowa (MRT)',
  ADHOC: 'strefa doraźna',
}

const UNIT_LABELS = {
  MIL: 'wojsko',
  OAT: 'ruch wojskowy (OAT)',
  COP: 'Centrum Operacji Powietrznych',
  EPRA: 'Radom',
  EPLY: 'Leźnica Wielka',
}

export function unitLabel(unit, airfieldNames) {
  const u = (unit || '').toUpperCase()
  return airfieldNames?.[u] || UNIT_LABELS[u] || u
}

// Rezerwacja trwająca w chwili `now` (ms). Rezerwacje strefy nie nachodzą na
// siebie, więc pierwsza pasująca wystarcza.
export function activeReservation(res, now) {
  return (res || []).find(r => r.s <= now && now < r.e) || null
}

// Strefy przychodzą pocięte na sektory (EPTS7A…E, EPD25A/B) — zwykle z tą
// samą rezerwacją. Na mapie jeden podpis na całą grupę, inaczej pięć
// nakładających się napisów.
export function groupKey(designator) {
  return String(designator || '').replace(/[A-Z]$/, '')
}

// Krótka nazwa do podpisu: bez prefiksu kraju — „EPTS7” → „TS7”.
export function shortName(designator) {
  return String(designator || '').replace(/^EP/, '')
}

// Surowa odpowiedź PAŻP (tablica Feature GeoJSON) → lekkie strefy do mapy.
// UUP zastępuje AUP dla struktur, które obejmuje; reszta zostaje z AUP.
// Zostają tylko rezerwacje na konkretne godziny — całodobowe nic nie mówią
// o tym, czy coś się dzieje (decyzja użytkownika: tylko „gdy coś się dzieje”).
export function trimZones(aupFeatures, uupFeatures, milIcao) {
  const byId = new Map()
  for (const f of aupFeatures || []) {
    const id = f?.properties?.designator
    if (id) byId.set(id, f)
  }
  for (const f of uupFeatures || []) {
    const id = f?.properties?.designator
    if (id) byId.set(id, f)
  }

  const zones = []
  for (const [id, f] of byId) {
    const p = f.properties || {}
    const type = p.airspaceElementType
    if (!ZONE_TYPES.has(type)) continue
    const res = (p.airspaceReservations || [])
      .filter(r => isMilitaryReservation(r, milIcao))
      .map(r => ({
        s: Date.parse(r.startDate),
        e: Date.parse(r.endDate),
        lo: r.lowerAltitude || null,
        hi: r.upperAltitude || null,
        unit: r.unit || null,
        rem: r.remarks || null,
      }))
      .filter(r => Number.isFinite(r.s) && Number.isFinite(r.e) && !isAllDay(r))
    if (!res.length) continue
    const rings = geometryRings(f.geometry)
    if (!rings.length) continue
    zones.push({ id, type, rings, res })
  }
  return zones
}

const r4 = v => Math.round(v * 1e4) / 1e4

// GeoJSON [lon, lat] → Leaflet [lat, lon]; tylko obrysy zewnętrzne.
function geometryRings(g) {
  if (!g) return []
  const polys = g.type === 'Polygon' ? [g.coordinates]
    : g.type === 'MultiPolygon' ? g.coordinates : []
  return polys
    .map(p => (p?.[0] || []).map(([lon, lat]) => [r4(lat), r4(lon)]))
    .filter(ring => ring.length >= 3)
}
