import { THREAT } from './palette'

// Poziomy ryzyka dronowego — wspólne dla nakładki na mapie i dla plakietki
// nad mapą, żeby kolor na mapie i kolor w podpisie nie mogły się rozjechać.
// Progi liczy serwer (netlify/functions/lib/threat.js); tutaj tylko wygląd.

export const THREAT_LEVELS = {
  calm: { label: 'SPOKÓJ', color: THREAT.calm, short: 'spokój' },
  watch: { label: 'OBSERWACJA', color: THREAT.watch, short: 'obserwacja' },
  elevated: { label: 'PODWYŻSZONE', color: THREAT.elevated, short: 'podwyższone' },
  high: { label: 'WYSOKIE', color: THREAT.high, short: 'wysokie' },
}

export function threatStyle(level) {
  return THREAT_LEVELS[level] || THREAT_LEVELS.calm
}

// Wypełnienie rośnie skokowo z poziomem. Przy „spokoju” obrys jest ledwie
// widoczny — ma tylko pokazywać, których województw model w ogóle dotyczy,
// a nie przykrywać mapy kolorem, gdy nic się nie dzieje.
export const THREAT_FILL_OPACITY = {
  calm: 0.05,
  watch: 0.14,
  elevated: 0.24,
  high: 0.34,
}
