// Stan gotowości alertów — jedno miejsce prawdy dla karty w panelu Alerty
// i dla kropki na dzwonku w rogu mapy. Wcześniej ta logika siedziała w środku
// panelu, więc przycisk nie miał jak pokazać, że coś nie gra, bez otwierania.

import { KIND_COLORS } from './palette'

// Kategorie maszyn — sterują mapą I powiadomieniami, więc lista mieszka poza
// panelami: czyta ją panel Mapa (przełączniki) i karta gotowości (licznik).
export const KIND_ROWS = [
  { key: 'mil', labelKey: 'FILTER_MIL', color: KIND_COLORS.mil },
  { key: 'heli', labelKey: 'FILTER_HELI', color: KIND_COLORS.heli },
  { key: 'heavy', labelKey: 'FILTER_HEAVY', color: KIND_COLORS.heavy },
]

export function kindsOnCount(kinds) {
  return KIND_ROWS.filter(k => kinds?.[k.key]).length
}

// Alerty wymagają trzech rzeczy naraz: pozycji, włączonego pusha i choćby
// jednej kategorii. Poziomy: 'off' (nic nie zadziała), 'warn' (zadziała, ale
// nie tak, jak można by chcieć), 'ok'. Karta w Alertach mówi tylko
// „aktywne" (ok) albo „nieaktywne" (reszta); kropka na dzwonku rozróżnia
// też 'warn'.
export function alertsLevel({ hasGps, pushOn, kindsOn }) {
  if (!hasGps) return 'off'
  if (kindsOn === 0 || !pushOn) return 'warn'
  return 'ok'
}
