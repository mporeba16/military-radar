// Stan gotowości alertów — jedno miejsce prawdy dla karty w panelu Alerty
// i dla kropki na dzwonku w rogu mapy. Wcześniej ta logika siedziała w środku
// panelu, więc przycisk nie miał jak pokazać, że coś nie gra, bez otwierania.

import { t } from '../i18n'
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

// Bez GPS karta od razu mówi, co zrobić.
function gpsWhy(locationError) {
  if (locationError === 'Brak zgody na lokalizację') return { text: t('GPS_DENIED_HINT'), retry: false }
  if (locationError) return { text: t('GPS_OFF_DESC'), retry: true }
  return { text: t('GPS_SEARCHING'), retry: true }
}

// Alerty wymagają trzech rzeczy naraz: pozycji, włączonego pusha i choćby
// jednej kategorii. Poziomy: 'off' (nic nie zadziała), 'warn' (zadziała, ale
// nie tak, jak można by chcieć), 'ok'.
export function readiness({ hasGps, pushOn, kindsOn, locationError }) {
  if (!hasGps) {
    const g = gpsWhy(locationError)
    return { level: 'off', title: t('READY_NO_GPS'), why: g.text, retry: g.retry }
  }
  if (kindsOn === 0) return { level: 'warn', title: t('READY_MUTED'), why: t('READY_WHY_MUTED') }
  if (!pushOn) return { level: 'warn', title: t('READY_APP_ONLY'), why: t('READY_WHY_APP_ONLY') }
  return { level: 'ok', title: t('READY_OK'), why: null }
}
