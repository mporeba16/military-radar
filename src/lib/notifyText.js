import { getCommonName } from './typeNames'
import { plForm } from './plural'
import { countryCodeFromHex } from './countries'

// Treść powiadomień — JEDNO miejsce dla pusha z serwera i dla lokalnego
// powiadomienia klienta. Wcześniej te same napisy składały się w dwóch plikach
// i zaczęły się rozjeżdżać.
//
// Układ jest pisany pod ekran zegarka, gdzie liczy się każda linia:
//   tytuł  — kategoria, nazwa własna maszyny i DYSTANS, bo tylko dystans
//            decyduje, czy warto wyjść przed dom
//   treść  — callsign, kod ICAO, poziom lotu i kurs, potrzebne dopiero wtedy,
//            gdy już patrzysz w niebo
// Jeden separator (·) zamiast mieszanki nawiasów, myślnika i przecinków.

export const CLOSE_RANGE_KM = 10
const LIST_MAX = 5

// Powyżej tego nazwa własna zjada całą linię tytułu, więc wracamy do kodu ICAO.
const MAX_NAME_LEN = 16

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function compassDir(track) {
  if (track == null) return null
  return COMPASS[Math.round(track / 45) % 8]
}

// Poziom lotu — zostaje jako pomocnik (żargon lotniczy), ale treści
// powiadomień podają metry, tak jak reszta aplikacji.
export function flightLevel(altBaroFt) {
  if (altBaroFt == null) return null
  return `FL${String(Math.round(altBaroFt / 100)).padStart(3, '0')}`
}

// „Hercules" zamiast „C130". Nazwy z ukośnikiem („M28 Bryza / An-28") tniemy do
// pierwszego członu, a gdy i tak wychodzi za długa — zostaje kod ICAO.
export function shortTypeName(ac) {
  const common = getCommonName(ac?.t)
  if (common) {
    const first = common.split('/')[0].trim()
    if (first && first.length <= MAX_NAME_LEN) return first
  }
  const code = (ac?.t || '').trim()
  return code || null
}

function callsign(ac) {
  return ac?.flight?.trim() || ac?.hex || '?'
}

// Kto lata tym śmigłowcem. „Śmigłowiec służbowy” nic nie mówił, a na ekranie
// zegarka ucinał się w połowie — tytuł ma od razu nazwać służbę.
// Rejestracja SN- noszą i policja, i Straż Graniczna, więc sama nie
// rozstrzyga: wtedy zamiast zgadywać podajemy typ maszyny.
export function heliRole(ac) {
  const cs = (ac?.flight || '').trim().toUpperCase()
  const reg = (ac?.reg || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^(LPR|RATOWNIK|HEMS|MEDIC|RESCUE|LIFEGUARD|REGA|SAR)/.test(cs)) return 'Ratunkowy'
  if (/^SP(HX|DX)/.test(reg)) return 'Ratunkowy'
  if (/^(POLICJA|POLICE)/.test(cs)) return 'Policja'
  if (/^(STRAZ|SG\d|BORDER)/.test(cs)) return 'Straż Graniczna'
  return null
}

// Wysokość w metrach — tak jak w całej aplikacji. Wcześniej treść podawała
// poziom lotu („FL013”), czyli żargon, którego karta nigdzie nie używa.
export function altMetres(altBaroFt) {
  if (altBaroFt == null) return null
  return `${Math.round(altBaroFt * 0.3048).toLocaleString('pl-PL')} m`
}

// Skrót kraju rejestracji przed nazwą maszyny („PL CASA CN-295”, „UA An-26”).
// Adres ICAO niesie kraj rejestracji, więc wiadomo to zawsze, nawet gdy
// maszyna nie podaje znaku wywoławczego ani typu.
function withCountry(hex, name) {
  const code = countryCodeFromHex(hex)
  return code ? `${code} ${name}` : name
}

// Pojedyncza maszyna: { title, body }.
export function alertText(ac, distKm) {
  const kind = ac.kind || 'mil'
  const km = `${Math.round(distKm)} km`
  const name = shortTypeName(ac)
  const code = (ac.t || '').trim()

  // Tytuł ma się zmieścić na ekranie zegarka — nazwa maszyny (albo służby)
  // i dystans, bez kategorii, która i tak nic nie wnosi.
  let title
  let titleHasType = false
  if (kind === 'heavy') {
    title = `${withCountry(ac.hex, name || 'Duży samolot')} · ${km}`
    titleHasType = !!name
  } else if (kind === 'heli') {
    const role = heliRole(ac)
    // Bez rozpoznanej służby prowadzi nazwa maszyny — „Śmigłowiec Black Hawk”
    // nie mieści się na zegarku, a słowo „śmigłowiec” i tak nic nie dodaje.
    title = `${withCountry(ac.hex, role || name || 'Śmigłowiec')} · ${km}`
    titleHasType = !role && !!name
  } else if (distKm <= CLOSE_RANGE_KM) {
    // Bliżej niż 10 km — znak ostrzegawczy zamiast słowa, żeby zostało
    // miejsce na nazwę maszyny.
    title = `⚠ ${withCountry(ac.hex, name || 'Samolot wojskowy')} · ${km}`
    titleHasType = !!name
  } else {
    title = `${withCountry(ac.hex, name || 'Samolot wojskowy')} · ${km}`
    titleHasType = !!name
  }

  // Bez znaku wywoławczego (decyzja użytkownika): „RCH744” nic nie mówi
  // komuś, kto patrzy w niebo, a zjadał pierwsze miejsce w treści. Tożsamość
  // maszyny jest na karcie po kliknięciu powiadomienia.
  const parts = []
  // Kod powtórzyłby tytuł tylko wtedy, gdy nie znaleźliśmy nazwy własnej.
  if (code && !(titleHasType && name === code)) parts.push(code)
  const alt = altMetres(ac.alt_baro)
  if (alt) parts.push(alt)
  const dir = compassDir(ac.track)
  if (dir) parts.push(`kurs ${dir}`)

  return { title, body: parts.join(' · ') }
}

function groupWord(kind, n, near) {
  if (kind === 'heavy') return plForm(n, 'duży samolot', 'duże samoloty', 'dużych samolotów')
  if (kind === 'heli') return plForm(n, 'śmigłowiec', 'śmigłowce', 'śmigłowców')
  const w = plForm(n, 'wojskowy', 'wojskowe', 'wojskowych')
  return near ? `${w} blisko` : w
}

// Rzadka maszyna nad Polską (tankowiec, AWACS, rozpoznanie…). Tytuł niesie
// rolę, bo to ona jest wiadomością; zamiast dystansu od użytkownika —
// najbliższe znane lotnisko, żeby wiedzieć, nad którą częścią kraju leci.
export function rareText(ac, role, nearName) {
  const name = shortTypeName(ac)
  const where = nearName ? `okolice ${nearName}` : 'nad Polską'
  const title = `${role} · ${where}`
  const parts = []
  if (name) parts.push(name)
  const alt = altMetres(ac.alt_baro)
  if (alt) parts.push(alt)
  const dir = compassDir(ac.track)
  if (dir) parts.push(`kurs ${dir}`)
  return { title, body: parts.join(' · ') }
}

export function rareGroupText(list) {
  const n = list.length
  const title = `${n} ${plForm(n, 'rzadka maszyna', 'rzadkie maszyny', 'rzadkich maszyn')} nad Polską`
  const names = list.slice(0, LIST_MAX).map(({ ac, role }) => `${callsign(ac)} (${role.toLowerCase()})`)
  const extra = n - names.length
  return { title, body: `${names.join(' · ')}${extra > 0 ? ` +${extra}` : ''}` }
}

// Jumbo jet albo An-124 z celem w Rzeszowie/Krakowie. W tytule lotnisko
// i godzina lądowania — to jest wiadomość; w treści maszyna, skąd leci
// i ile jeszcze.
export function inboundText(x, airportName, clock, eta) {
  const name = shortTypeName(x) || (x.t || '').trim() || 'transportowiec'
  // Trzy stopnie pewności i każdy mówi o sobie prawdę:
  //   plan lotu  — „Rzeszów: Jumbo Jet ok. 17:10"
  //   podejście  — „Jumbo Jet podchodzi: Rzeszów" (widać to z geometrii lotu)
  //   pamięć     — „Jumbo Jet → Rzeszów" (ten znak wywoławczy tam już siadał)
  const guess = x.route?.guess === true
  const learned = x.route?.learned === true
  const title = guess
    ? `${name} podchodzi: ${airportName}`
    : learned
      ? (clock ? `${name} → ${airportName} ok. ${clock}` : `${name} → ${airportName}`)
      : (clock ? `${airportName}: ${name} ok. ${clock}` : `${airportName}: ${name}`)
  const parts = []
  if (!guess && !learned) parts.push(name)
  const from = x.route?.fromCity || x.route?.from
  if (from) parts.push(`z ${from}`)
  if (guess && clock) parts.push(`ok. ${clock}`)
  if (eta) parts.push(`za ${eta}`)
  if (learned) parts.push('cel z wcześniejszych lotów')
  return { title, body: parts.join(' · ') }
}

// Kilka maszyn w jednym przebiegu: dystans najbliższej w tytule, reszta listą.
export function groupText(list, kind) {
  const sorted = [...list].sort((a, b) => a._dist - b._dist)
  const n = sorted.length
  const near = (kind || 'mil') === 'mil' && sorted[0]._dist <= CLOSE_RANGE_KM

  const title = `${n} ${groupWord(kind || 'mil', n, near)} · od ${Math.round(sorted[0]._dist)} km`

  // Nazwy maszyn zamiast znaków wywoławczych — spójnie z pojedynczym alertem.
  const names = sorted.slice(0, LIST_MAX)
    .map(a => heliRole(a) || shortTypeName(a) || (a.t || '').trim() || '?')
  const extra = n - names.length

  return { title, body: `${names.join(' · ')}${extra > 0 ? ` +${extra}` : ''}` }
}

