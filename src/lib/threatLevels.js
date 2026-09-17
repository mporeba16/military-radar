// Poziomy ryzyka dronowego — wspólne dla nakładki na mapie i dla plakietki
// nad mapą, żeby kolor na mapie i kolor w podpisie nie mogły się rozjechać.
// Progi liczy serwer (netlify/functions/lib/threat.js); tutaj tylko wygląd.

export const THREAT_LEVELS = {
  calm: { label: 'SPOKÓJ', color: '#2f7f5b', short: 'spokój' },
  watch: { label: 'OBSERWACJA', color: '#ffb300', short: 'obserwacja' },
  elevated: { label: 'PODWYŻSZONE', color: '#ff7a00', short: 'podwyższone' },
  high: { label: 'WYSOKIE', color: '#ff2d55', short: 'wysokie' },
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
