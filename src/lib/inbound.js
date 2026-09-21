// Wielkie transportowce lecące do Rzeszowa albo Krakowa — logika wspólna dla
// funkcji serwera i mapy. Czyste funkcje, bez sieci.
//
// ADS-B nie niesie celu lotu, więc trasę bierzemy po znaku wywoławczym z
// adsbdb. Maszyny szukamy globalnie po typie (adsb.lol), bo 747 startujący
// w Chicago jest poza obszarem, który aplikacja pobiera na co dzień.

import { haversine } from './geo'
import { AIRFIELDS } from '../airfields'

// Tylko jumbo jety i Rusłan (decyzja użytkownika). Lista jest krótka celowo:
// adsb.lol limituje zapytania i po kilku pod rząd odpowiada 429 — a każde
// zapytanie o typ, którego nikt nie lata, zabiera limit temu, o który chodzi.
// Pomiar na żywo (21.09.2026): B744 → 44 maszyny, B748 → 28, a B742, B743,
// B74D, B74R i B74F → zero. B74F w ogóle nie jest kodem ICAO, a Rusłany
// (A124) stały na końcu listy i padały na 429 po pustych zapytaniach.
export const WATCHED_TYPES = ['B744', 'B748', 'A124']

// Do rozpoznawania maszyny w danych (nie do odpytywania) — szerzej niż lista
// wyżej, bo w rekordzie może stać dowolna odmiana 747.
const WATCHED_TYPE_RE = /^(B74[0-9A-Z]?|A124|A225)$/

export const ARRIVAL_AIRPORTS = [
  { icao: 'EPRZ', name: 'Rzeszów', lat: 50.11, lon: 22.019 },
  { icao: 'EPKK', name: 'Kraków', lat: 50.0777, lon: 19.7848 },
]

export function isWatchedType(t) {
  return WATCHED_TYPE_RE.test(String(t || '').trim().toUpperCase())
}

// Czas dolotu liczony po linii prostej i z bieżącej prędkości — przy locie
// zza oceanu to szacunek z błędem kilkunastu–kilkudziesięciu minut, stąd „ok.”
// przy godzinie. Bez prędkości (albo przy maszynie stojącej) nie zgadujemy.
const MIN_GS_KT = 100

export function etaMinutes(ac, airport) {
  if (!ac || ac.gs == null || ac.gs < MIN_GS_KT) return null
  const km = haversine(ac.lat, ac.lon, airport.lat, airport.lon)
  const kmh = ac.gs * 1.852
  return Math.round((km / kmh) * 60)
}

export function distanceKm(ac, airport) {
  return Math.round(haversine(ac.lat, ac.lon, airport.lat, airport.lon))
}

// ── Podejście do lądowania rozpoznane z samego lotu ───────────────────────
// Trasa z adsbdb zna loty rozkładowe, ale ruch, który tu najbardziej
// interesuje — czartery towarowe do Rzeszowa (NCR, GTI, CKS) — leci pod
// znakiem wywoławczym, którego żadna baza rozkładów nie zna. Pomiar na żywo
// (21.09.2026): 12 z 63 jumbo jetów w powietrzu nie miało trasy i były wśród
// nich dokładnie te firmy. Bez tego rozpoznania taki lot nie mógł wywołać
// powiadomienia NIGDY, niezależnie od tego, gdzie lądował.
//
// Zgadujemy wyłącznie z geometrii lotu: maszyna leci w stronę lotniska i jest
// już niżej, niż leci się w przelocie. Drugi warunek jest tu kluczowy —
// bez niego cargo Air China (CAO) przelatujące nad Polską do Chin celowałoby
// w Rzeszów za każdym razem.
// Zasięg celowo krótki. Z daleka pojedyncza próbka kursu kłamie: pomiar na
// żywym ruchu złapał rejs Wizz Air 137 km od Rzeszowa, który w tym momencie
// celował w Rzeszów, a faktycznie schodził do Krakowa (manewrowanie na
// podejściu). Poniżej ~120 km podejście jest już jednoznaczne — kosztem tego,
// że powiadomienie przychodzi kilkanaście minut przed lądowaniem, a nie
// godzinę. Lepiej później niż o złym lotnisku.
const GUESS_MAX_KM = 120
const GUESS_MAX_OFF_DEG = 30
const CRUISE_CEILING_FT = 16000

// Samo „leci w tę stronę i już zszedł" to za mało: pomiar na żywym ruchu
// (21.09.2026, 278 maszyn nad Polską) dał 12 wskazań, z czego kilka to były
// rejsy schodzące do Warszawy — Okęcie leży mniej więcej na linii z zachodu
// do Rzeszowa. Dlatego cel musi być jeszcze NAJBLIŻSZYM lotniskiem, na którym
// taka maszyna w ogóle może usiąść (małe lotniska nie liczą się jako
// konkurencja, bo 747 tam nie wyląduje).
const BIG_RUNWAY_ICAO = new Set([
  'EPWA', 'EPMO', 'EPKK', 'EPRZ', 'EPKT', 'EPWR', 'EPPO', 'EPGD',
  'EPLB', 'EPBY', 'EPSC', 'EPLL', 'EPRA', 'EPPW', 'EPDE', 'EPMM',
])
const BIG_RUNWAYS = AIRFIELDS.filter(a => BIG_RUNWAY_ICAO.has(a.icao))

// Liczy się każde duże lotnisko, także to minięte przed chwilą: maszyna
// manewrująca na podejściu potrafi przez moment celować w sąsiednie lotnisko.
// Pomiar na żywo złapał rejs schodzący do Katowic, który akurat był zwrócony
// w stronę Krakowa — z samej geometrii wyszedłby zły cel.
function nearestBigAirfield(ac) {
  let best = null
  for (const a of BIG_RUNWAYS) {
    const km = haversine(ac.lat, ac.lon, a.lat, a.lon)
    if (!best || km < best.km) best = { icao: a.icao, km }
  }
  return best
}

export function bearingTo(ac, airport) {
  const φ1 = ac.lat * Math.PI / 180, φ2 = airport.lat * Math.PI / 180
  const Δλ = (airport.lon - ac.lon) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Różnica kursów w stopniach, zawsze 0–180 (kurs 350° i 10° dzieli 20°).
export function headingDiff(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360)
  return d > 180 ? 360 - d : d
}

// Pułap, powyżej którego maszyna jeszcze nie podchodzi do tego lotniska:
// profil zniżania to ok. 130 ft na kilometr, a w przelocie 747 siedzi na
// FL300+ — przelot nad Polską nigdy nie przejdzie tego progu.
function approachCeilingFt(km) {
  return Math.min(CRUISE_CEILING_FT, 2000 + km * 130)
}

// Zwraca { airport, etaMin } albo null. Wybiera lotnisko, do którego jest
// najbliżej w czasie.
export function approachGuess(ac, airports = ARRIVAL_AIRPORTS) {
  if (!ac || ac.on_ground || ac.track == null || ac.lat == null || ac.lon == null) return null
  if (typeof ac.alt_baro !== 'number') return null
  const nearest = nearestBigAirfield(ac)
  let best = null
  for (const airport of airports) {
    const km = haversine(ac.lat, ac.lon, airport.lat, airport.lon)
    if (km > GUESS_MAX_KM) continue
    if (ac.alt_baro > approachCeilingFt(km)) continue
    if (headingDiff(ac.track, bearingTo(ac, airport)) > GUESS_MAX_OFF_DEG) continue
    // Bliżej jest inne duże lotnisko — to ono jest prawdopodobnym celem.
    if (nearest && nearest.icao !== airport.icao && nearest.km < km - 10) continue
    const etaMin = etaMinutes(ac, airport)
    if (etaMin == null) continue
    if (!best || etaMin < best.etaMin) best = { airport, etaMin }
  }
  return best
}

export function airportByIcao(icao) {
  return ARRIVAL_AIRPORTS.find(a => a.icao === icao) || null
}

// „3 h 10 min” albo „47 min”.
export function formatEta(min) {
  if (min == null) return null
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

// Godzina lądowania w czasie polskim.
const hourFmt = new Intl.DateTimeFormat('pl-PL', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw',
})

export function landingClock(min, now = Date.now()) {
  if (min == null) return null
  return hourFmt.format(now + min * 60_000)
}
