// Pasma wysokości pokrywające się z legendą kolorów na mapie. Legenda była
// dotąd wyłącznie obrazkiem; rozbita na pasma staje się filtrem, którym odsiewa
// się tranzyt na dużej wysokości i zostawia to, co realnie widać z ziemi.
// Wyłączone pasmo PRZYGASZA maszyny, nie usuwa ich — nadal są klikalne.
export const ALT_BANDS = [
  { id: 'a0', label: '0 – 3 km', min: 0, max: 3000 },
  { id: 'a3', label: '3 – 6 km', min: 3000, max: 6000 },
  { id: 'a6', label: '6 – 9 km', min: 6000, max: 9000 },
  { id: 'a9', label: '9 – 12 km', min: 9000, max: 12000 },
  { id: 'a12', label: 'powyżej 12 km', min: 12000, max: Infinity },
]

export const ALL_BANDS_ON = Object.fromEntries(ALT_BANDS.map(b => [b.id, true]))

// Maszyna bez odczytu wysokości nie należy do żadnego pasma i nigdy nie jest
// przygaszana — filtr nie może ukrywać czegoś, o czym nic nie wiadomo.
export function bandForAltM(m) {
  if (m == null || !Number.isFinite(m)) return null
  for (const b of ALT_BANDS) if (m >= b.min && m < b.max) return b.id
  return null
}

// Normalizuje zapis z localStorage: nieznane klucze giną, brakujące wracają
// jako włączone, więc dołożenie pasma w przyszłości nie wycisza mapy.
export function normalizeBands(v) {
  const out = {}
  for (const b of ALT_BANDS) out[b.id] = !(v && typeof v === 'object' && v[b.id] === false)
  return out
}
