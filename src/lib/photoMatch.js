// Dopasowanie zdjęcia planespotters do samolotu — czyste funkcje (bez Reacta),
// wydzielone z AircraftInfoPanel, żeby dało się je testować.
//
// planespotters.net lookup is tricky for military:
//   - hex→photo: incomplete (Mi-17 hex 48DA46 returns nothing or stale link)
//   - reg→photo: registrations like "018" or "605" are NOT unique globally
//     (PLF038 / Polish C-295 reg 018 collides with Hellenic AF F-16 reg 018)
//
// Strategy: fetch BOTH endpoints in parallel, dedup by photo id, then pick the
// candidate whose slug URL best matches the aircraft type and operator inferred
// from the callsign. Planespotters URLs have the form
//   https://www.planespotters.net/photo/{id}/{reg}-{operator}-{model}
// so we can score reliably without an extra metadata fetch.

export const OPERATOR_HINT_BY_CALLSIGN = [
  [/^(PLF|RCF)/, 'polish'],
  [/^(GAF|LIFT)/, 'luftwaffe'],
  [/^(RCH|REACH|DUKE|JAKE|POLO|GORDO|PEARL|FORTE|RAZER|KNIFE|IRON|SWORD|VALOR|HEAVY|EAGLE\d|VIPER|KING\d)/, 'air-force'],  // USAF — slug usually has "united-states-air-force"
  [/^(MAGMA|ASCOT|COMET)/, 'royal-air-force'],
  [/^(NATO|NAOC|NATOQ)/, 'nato'],
  [/^(FRAF|CTM|COTAM|FNAV|FMRN)/, 'french'],  // CTM/COTAM = francuski transport wojskowy, FNAV/FMRN = lotnictwo MW
  [/^BAF\d/, 'belgian'],
  [/^DAMP/, 'danish'],
  [/^CZAF/, 'czech'],
  [/^SLAF/, 'slovak'],
  [/^HUNAF/, 'hungarian'],
  [/^(BUAF|BAH)/, 'bulgarian'],
  [/^ROTAF/, 'romanian'],
  [/^(FNY|FINAF)/, 'finnish'],
  [/^(NRAF|SAVER)/, 'norwegian'],
  [/^SWAF/, 'swedish'],
  [/^LTAF/, 'lithuanian'],
  [/^LVAF/, 'latvian'],
  [/^EEAF/, 'estonian'],
  [/^RIMC/, 'italian'],
  [/^SRA/, 'saudi'],
  [/^HAF/, 'hellenic'],
]

// ICAO type code → list of slug substrings planespotters uses in URLs.
// Mostly needed for airliners where the ICAO code (e.g. B738) doesn't
// appear in URLs (those use "boeing-737-800" / "737-800").
export const TYPE_SLUG_ALIASES = {
  // Boeing
  B737: ['737'], B738: ['737', '738', '737-800'], B739: ['737', '737-900'],
  B38M: ['737-max-8', '737-8'], B39M: ['737-max-9', '737-9'],
  B744: ['747', '747-400'], B748: ['747-8'], B752: ['757'], B753: ['757-300'],
  B762: ['767'], B763: ['767-300'], B764: ['767-400'],
  B772: ['777-200'], B773: ['777-300'], B77L: ['777-200lr'], B77W: ['777-300er'],
  B788: ['787', '787-8'], B789: ['787-9'], B78X: ['787-10'],
  B703: ['707'], B707: ['707'],
  // Airbus
  A318: ['a318'], A319: ['a319'], A320: ['a320'], A321: ['a321'],
  A20N: ['a320neo', 'a320'], A21N: ['a321neo', 'a321'],
  A332: ['a330-200', 'a330'], A333: ['a330-300', 'a330'],
  A338: ['a330-800neo', 'a330'], A339: ['a330-900neo', 'a330'],
  A342: ['a340-200'], A343: ['a340-300'], A345: ['a340-500'], A346: ['a340-600'],
  A359: ['a350-900', 'a350'], A35K: ['a350-1000', 'a350'],
  A380: ['a380'], A388: ['a380-800', 'a380'],
  A310: ['a310'], A30B: ['a300'],
  // McDonnell Douglas / DC
  MD11: ['md-11', 'md11'], DC10: ['dc-10'], DC9: ['dc-9'],
  MD80: ['md-80'], MD82: ['md-82'], MD83: ['md-83'], MD88: ['md-88'], MD90: ['md-90'],
  // Embraer regional
  E170: ['e-170', 'erj-170'], E175: ['e-175', 'erj-175'],
  E190: ['e-190', 'erj-190'], E195: ['e-195', 'erj-195'],
  E290: ['e190-e2'], E295: ['e195-e2'],
  // Tupolev / Antonov / Ilyushin
  IL62: ['il-62'], IL76: ['il-76'], IL78: ['il-78'], IL96: ['il-96'],
  AN12: ['an-12'], AN22: ['an-22'], AN26: ['an-26'], AN30: ['an-30'],
  AN32: ['an-32'], AN72: ['an-72'], AN74: ['an-74'], AN124: ['an-124'], AN225: ['an-225'],
  TU95: ['tu-95'], TU142: ['tu-142'], TU160: ['tu-160'], TU22: ['tu-22'],
  // Military transports (where ICAO != slug)
  C30J: ['c-130j', 'c-130'], C13J: ['c-130j', 'c-130'],
  C160: ['c-160', 'transall'],
  A400: ['a400m', 'a-400'], A400M: ['a400m'],
  // Fighters where dashes / numbers vary
  C295: ['c-295', 'cn-295'], C235: ['cn-235'], C212: ['c-212'],
  F35: ['f-35'], F16: ['f-16'], F15: ['f-15'], F18: ['f-18', 'fa-18'],
  F22: ['f-22'], F4: ['f-4'], F14: ['f-14'], F2: ['f-2'], F5: ['f-5'],
  F104: ['f-104'], F111: ['f-111'],
  MIR2: ['mirage-2000'], MIRF: ['mirage-f1'], MIRA: ['mirage'],
  M2KA: ['mirage-2000'], M2KC: ['mirage-2000'], M2KD: ['mirage-2000'], M2KN: ['mirage-2000'],
  EUFI: ['eurofighter', 'typhoon'], EF2000: ['typhoon', 'eurofighter'],
  RFAL: ['rafale'], JS39: ['gripen', 'jas-39'], JAS39: ['gripen', 'jas-39'],
  TORN: ['tornado'], B1: ['b-1'], B2: ['b-2', 'spirit'], B52: ['b-52'],
  A10: ['a-10'], U2: ['u-2'],
  T6: ['t-6', 'texan'], T7: ['t-7'], T45: ['t-45'], T38: ['t-38'],
  L39: ['l-39'], YK130: ['yak-130'], YAK130: ['yak-130'],
  AV8: ['av-8', 'harrier'], AV8B: ['av-8b'],
  // Helicopters
  AH64: ['ah-64', 'apache'], CH47: ['ch-47', 'chinook'], CH53: ['ch-53'],
  UH60: ['uh-60', 'black-hawk', 'blackhawk'],
  S70: ['s-70', 'black-hawk', 'blackhawk'], V22: ['v-22', 'osprey'],
  MV22: ['mv-22'], CV22: ['cv-22'],
  MI2: ['mi-2'], MI8: ['mi-8'], MI17: ['mi-17'], MI24: ['mi-24'], MI28: ['mi-28'],
  W3: ['w-3', 'sokol'], W3A: ['w-3', 'sokol'],
  EC135: ['ec135', 'ec-135'], EC145: ['ec145', 'ec-145'], EC725: ['ec725', 'caracal'],
  AS332: ['as332', 'super-puma'], AS532: ['as532', 'cougar'],
  // UAVs
  MQ9: ['mq-9', 'reaper'], MQ1: ['mq-1'], RQ4: ['rq-4'],
  // Dassault Falcon / business jets (ICAO code != planespotters slug)
  F900: ['falcon-900', 'falcon'], F2TH: ['falcon-2000', 'falcon'],
  FA7X: ['falcon-7x', 'falcon'], FA8X: ['falcon-8x', 'falcon'], F50: ['falcon-50', 'falcon'],
  F406: ['f406', 'caravan-ii'], E55P: ['phenom-300'], E50P: ['phenom-100'],
  GLF5: ['gulfstream-v'], GLF6: ['gulfstream'], C56X: ['citation'], C68A: ['citation'],
}

export function typeSlugCandidates(t) {
  const acType = (t || '').toUpperCase().replace(/[-\s]/g, '')
  if (!acType) return []
  const aliases = TYPE_SLUG_ALIASES[acType] || []
  const lower = acType.toLowerCase()
  // Always also try the raw forms — works for unique ICAO codes (Mi-17, F-16…)
  const dashed = lower.replace(/^([a-z]+)(\d.*)$/, '$1-$2')
  return [...new Set([...aliases, lower, dashed])]
}

export function scorePhotoMatch(photo, ac) {
  const link = (photo.link || '').toLowerCase()
  if (!link) return 0
  let score = 0

  // Type match — try multiple slug forms because planespotters uses the
  // marketing name ("boeing-737-800") not the ICAO code ("B738").
  const candidates = typeSlugCandidates(ac.t)
  if (candidates.length) {
    if (candidates.some(c => link.includes(c))) score += 100
    else score -= 30  // type known but slug doesn't mention any alias — wrong photo
  }

  // Operator hint from callsign prefix
  const callsign = (ac.flight || '').toUpperCase()
  for (const [re, hint] of OPERATOR_HINT_BY_CALLSIGN) {
    if (re.test(callsign)) {
      if (link.includes(hint)) score += 50
      break
    }
  }

  // Registration-sourced photo wins ties over a hex-sourced one — the reg is
  // the current airframe's identity, while a hex can be stale/reassigned in
  // planespotters (e.g. a French mil hex resolving to a retired Fouga). Bonus
  // is below the type-match weight (100), so a hex photo that truly matches the
  // type still wins over a reg photo that doesn't.
  if (photo._src === 'reg') score += 60

  return score
}

// Czy slug zdjęcia POZYTYWNIE potwierdza, że to ten samolot — zgodność typu
// LUB operatora. Bonus za źródło `reg` (+60) to tylko tie-breaker, NIE sygnał
// tożsamości: rejestracje wojskowe nie są globalnie unikalne (reg „018" =
// polski C-295 i grecki F-16), więc bez tego sygnału kandydaci są nieodróżnialni
// i wybór pierwszego z listy bywa po prostu złym płatowcem.
export function photoHasMatchSignal(photo, ac) {
  const link = (photo.link || '').toLowerCase()
  if (!link) return false
  const candidates = typeSlugCandidates(ac.t)
  if (candidates.length && candidates.some(c => link.includes(c))) return true
  const callsign = (ac.flight || '').toUpperCase()
  for (const [re, hint] of OPERATOR_HINT_BY_CALLSIGN) {
    if (re.test(callsign)) return link.includes(hint)
  }
  return false
}
