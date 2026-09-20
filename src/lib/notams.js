// NOTAM-y z autorouter.aero (źródło: europejska baza EAD) — logika wspólna dla
// funkcji serwera i mapy. Czyste funkcje, bez sieci.
//
// Interesują nas dwie rzeczy, bo tylko one mówią „coś się dzieje”:
//   - zamknięcie lotniska (Rzeszów i Lublin zamykano przy poderwaniu myśliwców
//     w czasie rosyjskich ataków na zachodnią Ukrainę),
//   - aktywność wojskowa w treści (MIL ACT, ćwiczenia, strefy).
// Reszta (dźwigi, godziny pracy, oświetlenie) ląduje na liście bez wyróżnienia.

// Lotniska, o które pytamy: Rzeszów i Lublin (sedno sprawy — wschód), do tego
// polskie bazy wojskowe, żeby ich dymki miały swoje NOTAM-y. Jedno zapytanie
// na wszystkie, więc lista nie mnoży wywołań API.
export const WATCHED_EAST = ['EPRZ', 'EPLB']

// Kod Q NOTAM-u: litery 2–3 to przedmiot (FA = lotnisko), 4–5 stan
// (LC = zamknięty). autorouter podaje je osobno jako code23 / code45.
const CLOSED_TEXT = /\b(AD|AERODROME|AIRPORT)\s+(CLSD|CLOSED)\b|LOTNISKO\s+(JEST\s+)?ZAMKNI/i
const MIL_TEXT = /\bMIL(ITARY)?\s+(ACT|ACTIVITY|EXER|OPS|FLT)|UNPLANNED|NIEPLANOWAN|AKTYWNO[SŚ][CĆ]\s+WOJSK|DZIA[LŁ]ANIA?\s+WOJSK|ĆWICZENI|CWICZENI/i

export function classifyNotam(n) {
  const text = n?.iteme || ''
  const closed = (n?.code23 === 'FA' && n?.code45 === 'LC') || CLOSED_TEXT.test(text)
  const mil = MIL_TEXT.test(text)
  return { closed, mil }
}

// Identyfikator jak w oficjalnym zapisie: „A1234/26”.
export function notamId(n) {
  const yy = String(n?.year ?? '').slice(-2).padStart(2, '0')
  return `${n?.series || ''}${n?.number ?? ''}/${yy}`
}

// Surowe wiersze API → NOTAM-y ważne teraz lub w ciągu `aheadMs`, pogrupowane
// po lotnisku. Wyróżnione (zamknięcie, wojsko) idą na początek listy.
export function groupNotams(rows, airports, now, aheadMs = 24 * 3600_000) {
  const out = Object.fromEntries(airports.map(a => [a, []]))
  const seen = new Set()
  for (const n of rows || []) {
    const from = Number(n.startvalidity) * 1000
    const to = Number(n.endvalidity) * 1000
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue
    if (to <= now || from > now + aheadMs) continue
    const id = notamId(n)
    const { closed, mil } = classifyNotam(n)
    for (const ap of n.itema || []) {
      if (!out[ap] || seen.has(`${ap}|${id}`)) continue
      seen.add(`${ap}|${id}`)
      out[ap].push({
        id, from, to,
        active: from <= now,
        closed, mil,
        text: String(n.iteme || '').trim(),
      })
    }
  }
  const rank = x => (x.closed ? 0 : x.mil ? 1 : 2)
  for (const ap of airports) out[ap].sort((a, b) => rank(a) - rank(b) || a.from - b.from)
  return out
}

// Najważniejszy aktywny sygnał lotniska: 'closed' > 'mil' > null.
export function airportAlert(list, now) {
  const live = (list || []).filter(x => x.from <= now && now < x.to)
  if (live.some(x => x.closed)) return 'closed'
  if (live.some(x => x.mil)) return 'mil'
  return null
}
