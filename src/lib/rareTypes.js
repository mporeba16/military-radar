// Maszyny, których pojawienie się nad Polską samo w sobie jest wiadomością:
// tankowce, samoloty wczesnego ostrzegania, rozpoznanie, bombowce, drony
// rozpoznawcze i — od 19.10.2026, na prośbę użytkownika — myśliwce.
// Transportowce latają codziennie, więc alert o nich byłby szumem. Rola (a nie
// nazwa typu) trafia do tytułu powiadomienia, bo to ona mówi, co się dzieje.
//
// Kody to desygnatory ICAO z adsb.fi. A332 liczy się wyłącznie dlatego, że
// sprawdzamy tylko listę /mil — tam A330 to tankowiec MRTT, nie samolot
// linii lotniczej.
import { knownAircraft, resolvedType } from './knownAircraft.js'

const RULES = [
  [/^(K35R|K35E|KC46|K46|A332|KC10)$/, 'Tankowiec'],
  [/^(E3TF|E3CF|E737|E7)$/, 'Wczesne ostrzeganie (AWACS)'],
  [/^(R135|E8|U2|EP3)$/, 'Rozpoznanie'],
  [/^(E6)$/, 'Samolot łączności (E-6)'],
  [/^(P8)$/, 'Patrol morski'],
  [/^(B52|B1|B2)$/, 'Bombowiec'],
  [/^(Q4|Q4A|Q4B|RQ4|MQ4|Q9|MQ9|ANKA)$/, 'Dron rozpoznawczy'],
  [/^(DRON|UAV)$/, 'Dron'],
  [/^(C5M|C5)$/, 'Transportowiec strategiczny'],
  // Myśliwce (prośba użytkownika: każdy myśliwiec nad Polską jak tankowiec).
  // Kody ICAO z adsb.fi; trenażery (M346, HAWK, L39) i szturmowe (A10, SU25)
  // celowo poza listą.
  [/^(F16|F15|F15[A-Z]|F18|F18[A-Z]|FA18|F35|F35[A-Z]|F22|F4|F14|F5|F5[A-Z]|EUFI|EF2000|RFAL|JS39|JAS39|SB39|MIR2|M2K[A-Z]?|MIRA|MIRF|TORN|AV8B|HARR|FA50|T50|MG29|MG31|SU27|SU30|SU33|SU34|SU35|SU57|SU24)$/, 'Myśliwiec'],
]

export function rareRole(type) {
  const t = String(type || '').trim().toUpperCase()
  if (!t) return null
  for (const [re, role] of RULES) if (re.test(t)) return role
  return null
}

// Maszyny, których typ nic nie mówi (CL60 to też zwykły biznesjet), a rolę
// zdradza znak wywoławczy: BRIO to Challengery ARTEMIS armii USA.
const CALLSIGN_RULES = [
  [/^BRIO\d/, 'Rozpoznanie (ARTEMIS)'],
]

// Maszyny, których kod typu to zwykły samolot cywilny, a rolę zdradza dopiero
// opis z bazy adsb.fi (pole `desc`): włoski KC-767A nadaje B762, brytyjski
// Shadow R1 — B350 jak każdy King Air.
const DESC_RULES = [
  [/KC-?767|KC-?135|KC-?46|KC-?10\b|KC-?30|MRTT|VOYAGER|STRATOTANKER|PEGASUS/, 'Tankowiec'],
  [/RC-?135|RIVET JOINT|COMBAT SENT|SHADOW R|ARTEMIS|SENTINEL R|MC-?12|GUARDRAIL|RC-?12|AIRSEEKER/, 'Rozpoznanie'],
  [/E-?767|SENTRY|WEDGETAIL|GLOBALEYE|ERIEYE/, 'Wczesne ostrzeganie (AWACS)'],
  [/POSEIDON|P-?8A/, 'Patrol morski'],
]

/**
 * Rola rzadkiej maszyny z całego rekordu: najpierw wpis ręczny po hexie
 * (knownAircraft), potem znak wywoławczy, typ, a na końcu opis z bazy.
 */
export function rareRoleFor(ac) {
  const known = knownAircraft(ac?.hex)?.rare
  if (known) return known
  const cs = String(ac?.flight || '').trim().toUpperCase()
  for (const [re, role] of CALLSIGN_RULES) if (re.test(cs)) return role
  // Typ z wpisu ręcznego ma pierwszeństwo — niemieckie Eurofightery nadają
  // bez kodu typu i bez tego nie byłyby rozpoznane jako myśliwce.
  const byType = rareRole(resolvedType(ac))
  if (byType) return byType
  const desc = String(ac?.desc || '').toUpperCase()
  if (desc) for (const [re, role] of DESC_RULES) if (re.test(desc)) return role
  return null
}
