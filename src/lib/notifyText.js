import { getCommonName } from './typeNames'
import { plForm } from './plural'
import { threatStyle } from './threatLevels'

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

// Pojedyncza maszyna: { title, body }.
export function alertText(ac, distKm) {
  const kind = ac.kind || 'mil'
  const km = `${Math.round(distKm)} km`
  const name = shortTypeName(ac)
  const code = (ac.t || '').trim()

  let title
  let titleHasType = false
  if (kind === 'heavy') {
    title = `${name || 'Duży samolot'} · ${km}`
    titleHasType = !!name
  } else if (kind === 'heli') {
    // Serwer nie wie, czy to pogotowie, policja czy Straż Graniczna, więc
    // kategoria zostaje ogólna, a typ schodzi do treści.
    title = `Śmigłowiec służbowy · ${km}`
  } else if (distKm <= CLOSE_RANGE_KM) {
    title = `Blisko · ${name || 'samolot wojskowy'} · ${km}`
    titleHasType = !!name
  } else {
    title = `Wojskowy ${name || 'samolot'} · ${km}`
    titleHasType = !!name
  }

  const parts = [callsign(ac)]
  // Kod powtórzyłby tytuł tylko wtedy, gdy nie znaleźliśmy nazwy własnej.
  if (code && !(titleHasType && name === code)) parts.push(code)
  const fl = flightLevel(ac.alt_baro)
  if (fl) parts.push(fl)
  const dir = compassDir(ac.track)
  if (dir) parts.push(`kurs ${dir}`)

  return { title, body: parts.join(' · ') }
}

function groupWord(kind, n, near) {
  if (kind === 'heavy') return plForm(n, 'duży samolot', 'duże samoloty', 'dużych samolotów')
  if (kind === 'heli') return plForm(n, 'śmigłowiec służbowy', 'śmigłowce służbowe', 'śmigłowców służbowych')
  const w = plForm(n, 'wojskowy', 'wojskowe', 'wojskowych')
  return near ? `${w} blisko` : w
}

// Kilka maszyn w jednym przebiegu: dystans najbliższej w tytule, reszta listą.
export function groupText(list, kind) {
  const sorted = [...list].sort((a, b) => a._dist - b._dist)
  const n = sorted.length
  const near = (kind || 'mil') === 'mil' && sorted[0]._dist <= CLOSE_RANGE_KM

  const title = `${n} ${groupWord(kind || 'mil', n, near)} · od ${Math.round(sorted[0]._dist)} km`

  const names = sorted.slice(0, LIST_MAX)
    .map(a => [callsign(a), (a.t || '').trim()].filter(Boolean).join(' '))
  const extra = n - names.length

  return { title, body: `${names.join(' · ')}${extra > 0 ? ` +${extra}` : ''}` }
}

// Powiadomienie o ryzyku dronowym. Inny gatunek niż alerty o maszynach: nie ma
// dystansu ani kursu, jest województwo i powód. Zastrzeżenie „szacunek, nie RCB”
// jedzie w treści, bo push bywa jedyną rzeczą, jaką człowiek zobaczy — karty
// w aplikacji może nie otworzyć.
export function threatText(raised) {
  const list = Array.isArray(raised) ? raised : []
  if (!list.length) return null

  // Najwyższy poziom decyduje o tytule — przy dwóch województwach naraz liczy
  // się to gorsze, nie to pierwsze alfabetycznie.
  const sorted = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const top = sorted[0]
  const levelLabel = threatStyle(top.level).short

  const title = sorted.length === 1
    ? `⚠ Ryzyko dronowe ${levelLabel} · ${top.name}`
    : `⚠ Ryzyko dronowe ${levelLabel} · ${sorted.length} ${plForm(sorted.length, 'województwo', 'województwa', 'województw')}`

  const where = sorted.length === 1
    ? null
    : sorted.map(r => `${r.name} (${threatStyle(r.level).short})`).join(', ')
  const why = top.reasons?.length ? top.reasons.slice(0, 2).join(' · ') : null

  const body = [where, why, 'Szacunek własny — nie komunikat RCB.']
    .filter(Boolean)
    .join('\n')

  return { title, body }
}
