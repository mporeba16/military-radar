// Wielkie transportowce lecące do Rzeszowa albo Krakowa — logika wspólna dla
// funkcji serwera i mapy. Czyste funkcje, bez sieci.
//
// ADS-B nie niesie celu lotu, więc trasę bierzemy po znaku wywoławczym z
// adsbdb. Maszyny szukamy globalnie po typie (adsb.lol), bo 747 startujący
// w Chicago jest poza obszarem, który aplikacja pobiera na co dzień.

import { haversine } from './geo'

// Tylko jumbo jety i Rusłan (decyzja użytkownika). Lista jest krótka celowo:
// adsb.lol limituje zapytania (po trzech pod rząd odpowiada 429), a B741–B743
// i tak nie latają już w ruchu towarowym. B74R to wersja SP/SR, B74F i B74D
// to odmiany towarowe — te kody w danych występują.
export const WATCHED_TYPES = ['B742', 'B744', 'B748', 'B74F', 'A124', 'A225']

export const ARRIVAL_AIRPORTS = [
  { icao: 'EPRZ', name: 'Rzeszów', lat: 50.11, lon: 22.019 },
  { icao: 'EPKK', name: 'Kraków', lat: 50.0777, lon: 19.7848 },
]

export function isWatchedType(t) {
  return WATCHED_TYPES.includes(String(t || '').trim().toUpperCase())
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
