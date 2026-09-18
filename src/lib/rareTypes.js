// Maszyny, których pojawienie się nad Polską samo w sobie jest wiadomością:
// tankowce, samoloty wczesnego ostrzegania, rozpoznanie, bombowce, drony
// rozpoznawcze. Myśliwce i transportowce latają codziennie — alert o nich
// byłby szumem. Rola (a nie nazwa typu) trafia do tytułu powiadomienia, bo to
// ona mówi, co się dzieje.
//
// Kody to desygnatory ICAO z adsb.fi. A332 liczy się wyłącznie dlatego, że
// sprawdzamy tylko listę /mil — tam A330 to tankowiec MRTT, nie samolot
// linii lotniczej.
const RULES = [
  [/^(K35R|K35E|KC46|K46|A332|KC10)$/, 'Tankowiec'],
  [/^(E3TF|E3CF|E737|E7)$/, 'Wczesne ostrzeganie (AWACS)'],
  [/^(R135|E8|U2|EP3)$/, 'Rozpoznanie'],
  [/^(E6)$/, 'Samolot łączności (E-6)'],
  [/^(P8)$/, 'Patrol morski'],
  [/^(B52|B1|B2)$/, 'Bombowiec'],
  [/^(Q4|Q4A|Q4B|RQ4|MQ4|Q9|MQ9)$/, 'Dron rozpoznawczy'],
  [/^(C5M|C5)$/, 'Transportowiec strategiczny'],
]

export function rareRole(type) {
  const t = String(type || '').trim().toUpperCase()
  if (!t) return null
  for (const [re, role] of RULES) if (re.test(t)) return role
  return null
}
