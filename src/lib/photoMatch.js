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
  [/^(RCH|REACH|DUKE|JAKE|POLO|GORDO|PEARL|SPAR|SAM\d|FORTE|RAZER|KNIFE|IRON|SWORD|VALOR|HEAVY|EAGLE\d|VIPER|KING\d)/, 'air-force'],  // USAF — slug usually has "united-states-air-force"
  [/^(MAGMA|ASCOT|COMET)/, 'royal-air-force'],
  [/^(NATO|NAOC|NATOQ)/, 'nato'],
  [/^(FRAF|CTM|COTAM|FNAV|FMRN)/, 'french'],  // CTM/COTAM = francuski transport wojskowy, FNAV/FMRN = lotnictwo MW
  [/^BAF\d/, 'belgian'],
  [/^DAMP/, 'danish'],
  // CEF to znak wywoławczy czeskich sił powietrznych (obok CZAF).
  [/^(CZAF|CEF\d)/, 'czech'],
  [/^SLAF/, 'slovak'],
  [/^HUNAF/, 'hungarian'],
  [/^BUAF/, 'bulgarian'],
  [/^BAH/, 'bahrain'],  // Bahrain Amiri Air Force — NIE Bułgaria
  [/^ROTAF/, 'romanian'],
  [/^(FNY|FINAF)/, 'finnish'],
  [/^(NRAF|SAVER)/, 'norwegian'],
  // SVF = szwedzkie siły powietrzne (Svenska Flygvapnet) — SVF631 to Saab 340.
  [/^(SWAF|SVF)/, 'swedish'],
  [/^LTAF/, 'lithuanian'],
  [/^LVAF/, 'latvian'],
  [/^EEAF/, 'estonian'],
  [/^RIMC/, 'italian'],
  [/^SRA/, 'saudi'],
  [/^HAF/, 'hellenic'],
  // Lotnicze Pogotowie Ratunkowe — slug planespotters brzmi
  // „lpr-polish-medical-air-rescue", więc sam skrót wystarczy.
  [/^(LPR|RATOWNIK)/, 'lpr'],
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
  // Embraer C-390: adsb.fi podaje E390, a w adresie zdjęcia stoi „kc-390"
  // albo „c-390-millennium" — kod ICAO nie pada tam nigdy.
  E390: ['kc-390', 'c-390', 'millennium'],
  L410: ['l-410', 'turbolet'], L610: ['l-610'],
  C295: ['c-295', 'cn-295'], C235: ['cn-235'], CN35: ['cn-235'], C212: ['c-212'],
  F35: ['f-35'], F16: ['f-16'], F15: ['f-15'], F18: ['f-18', 'fa-18'],
  F22: ['f-22'], F4: ['f-4'], F14: ['f-14'], F2: ['f-2'], F5: ['f-5'],
  F104: ['f-104'], F111: ['f-111'],
  MIR2: ['mirage-2000'], MIRF: ['mirage-f1'], MIRA: ['mirage'],
  M2KA: ['mirage-2000'], M2KC: ['mirage-2000'], M2KD: ['mirage-2000'], M2KN: ['mirage-2000'],
  EUFI: ['eurofighter', 'typhoon'], EF2000: ['typhoon', 'eurofighter'],
  RFAL: ['rafale'], JS39: ['gripen', 'jas-39'], JAS39: ['gripen', 'jas-39'],
  TORN: ['tornado'], B1: ['b-1', 'lancer'], B2: ['b-2', 'spirit'], B52: ['b-52'],
  A10: ['a-10'], U2: ['u-2'],
  T6: ['t-6', 'texan'], T7: ['t-7'], T45: ['t-45'], T38: ['t-38'],
  L39: ['l-39'], YK130: ['yak-130'], YAK130: ['yak-130'],
  AV8: ['av-8', 'harrier'], AV8B: ['av-8b'],
  // Helicopters
  AH64: ['ah-64', 'apache'], CH47: ['ch-47', 'chinook'], CH53: ['ch-53'],
  UH60: ['uh-60', 'black-hawk', 'blackhawk'],
  S70: ['s-70', 'black-hawk', 'blackhawk'], V22: ['v-22', 'osprey'],
  MV22: ['mv-22'], CV22: ['cv-22'],
  // Rodzina Mi-8/Mi-17 chodzi pod jednym kodem: adsb.fi podaje MI8 również dla
  // Mi-17 (eksportowy Mi-8MT), a planespotters pisze w adresie „mil-mi-17".
  // Bez wzajemnych aliasów poprawne zdjęcie polskiego Mi-17 wyglądałoby na cudze.
  MI2: ['mi-2'],
  MI8: ['mi-8', 'mi-17', 'mi-171', 'mi-8mt', 'hip'],
  MI17: ['mi-17', 'mi-8', 'mi-171', 'mi-8mt', 'hip'],
  MI24: ['mi-24'], MI28: ['mi-28'],
  // PZL M28 Bryza. adsb.fi podaje AN28 (rodowód An-28), a planespotters pisze
  // „pzl-mielec-m-28b-pt" — bez tego aliasu poprawne zdjęcie było odrzucane.
  AN28: ['m-28', 'm28', 'bryza', 'skytruck', 'an-28'],
  M28: ['m-28', 'm28', 'bryza', 'skytruck', 'an-28'],
  C145: ['m-28', 'skytruck'], A28: ['an-28'],
  W3: ['w-3', 'sokol'], W3A: ['w-3', 'sokol'],
  EC135: ['ec135', 'ec-135'], EC145: ['ec145', 'ec-145'], EC725: ['ec725', 'caracal'],
  // UWAGA: adsb.fi podaje DESYGNATORY ICAO (EC35, EC45), nie nazwy handlowe.
  // Tablica miała tylko te drugie, więc EC135 pogotowia nie dopasowywał się do
  // własnego zdjęcia i karta pokazywała „brak zdjęcia" mimo trafienia w API.
  EC35: ['ec135', 'ec-135', 'h135'], EC45: ['ec145', 'ec-145', 'h145'],
  EC20: ['ec120'], EC30: ['ec130'], EC55: ['ec155'], EC75: ['ec725', 'h225'],
  H135: ['h135', 'ec135'], H145: ['h145', 'ec145'], H125: ['h125', 'as350'],
  H160: ['h160'], H175: ['h175'],
  A109: ['a109'], A139: ['aw139', 'a139'], A169: ['aw169'], A189: ['aw189'],
  A119: ['aw119', 'koala'], A149: ['aw149'], A129: ['a129', 'mangusta'],
  S76: ['s-76'], S92: ['s-92'], B407: ['bell-407'], B429: ['bell-429'],
  B06: ['bell-206', 'jetranger'], B412: ['bell-412'], BK17: ['bk-117'],
  AS332: ['as332', 'super-puma'], AS532: ['as532', 'cougar'],
  // W adresie zdjęcia stoi „as-332m1-super-puma", a kod z ADS-B to AS32 —
  // bez aliasu zdjęcie własnej maszyny dostawało karę za niezgodny typ.
  AS32: ['as-332', 'as332', 'as-532', 'super-puma', 'cougar'],
  // UAVs
  MQ9: ['mq-9', 'reaper'], MQ1: ['mq-1'], RQ4: ['rq-4'],
  Q9: ['mq-9', 'reaper'], Q4: ['rq-4', 'mq-4', 'global-hawk', 'triton'],
  // Desygnatory ICAO wojskowych Boeingów i Lockheedów nie mają nic wspólnego
  // z nazwą w adresie zdjęcia: K35R to „boeing-kc-135t-stratotanker”, R135 to
  // „boeing-rc-135w”. Bez tych aliasów zdjęcie tankowca 59-1460 (ae0596) było
  // odrzucane jako cudze — rejestracja z samych cyfr nie jest dowodem, a
  // maszyna nie nadawała znaku wywoławczego.
  K35R: ['kc-135', 'stratotanker'], K35E: ['kc-135', 'stratotanker'],
  KC46: ['kc-46', 'pegasus'], K46: ['kc-46', 'pegasus'], KC10: ['kc-10', 'extender'],
  R135: ['rc-135', 'rivet-joint'], C135: ['c-135'], E3TF: ['e-3', 'sentry'],
  E3CF: ['e-3', 'sentry'], E737: ['e-7', 'wedgetail', '737-7es'],
  E6: ['e-6', 'mercury'], E8: ['e-8', 'jstars'], P8: ['p-8', 'poseidon'],
  P3: ['p-3', 'orion'], EP3: ['ep-3'], E2: ['e-2', 'hawkeye'],
  C5M: ['c-5', 'galaxy'], C5: ['c-5', 'galaxy'], C17: ['c-17', 'globemaster'],
  H60: ['uh-60', 'hh-60', 'mh-60', 'sh-60', 'black-hawk', 'blackhawk', 'seahawk'],
  H47: ['ch-47', 'chinook'],
  // Dassault Falcon / business jets (ICAO code != planespotters slug)
  F900: ['falcon-900', 'falcon'], F2TH: ['falcon-2000', 'falcon'],
  FA7X: ['falcon-7x', 'falcon'], FA8X: ['falcon-8x', 'falcon'], F50: ['falcon-50', 'falcon'],
  // Beechcraft King Air / C-12 Huron (USAF „SPAR"). Slug: „beechcraft-c-12c-b200-super-king-air".
  BE20: ['b200', 'king-air', 'c-12'], BE9L: ['king-air', 'c90'], BE9T: ['king-air', 'f90'],
  BE30: ['b300', 'king-air-350', 'king-air'], B350: ['b300', 'king-air-350', 'king-air'],
  EXPL: ['md-900', 'md-902', 'explorer'],
  F406: ['f406', 'caravan-ii'], E55P: ['phenom-300'], E50P: ['phenom-100'],
  GLF5: ['gulfstream-v', 'gulfstream', 'c-37'], GLF6: ['gulfstream'], C68A: ['citation'],
  // Wojskowe Citationy: USAF i US Army latają nimi jako UC-35, a planespotters
  // pisze „cessna-uc-35a-citation-ultra”. Sam kod C560 w adresie nie występuje,
  // więc zdjęcie SPAR95 (adfebb) było odrzucane.
  // Szwedzkie Saaby: w adresie zdjęcia stoi oznaczenie wojskowe („saab-tp-100c
  // -340b”, „s-100b-argus”), nie kod ICAO.
  SF34: ['saab-340', '340b', 'tp-100', 's-100'], SB20: ['saab-2000', '2000', 'tp-102'],
  // Learjety: USAF lata nimi jako C-21A, a w adresie zdjęcia stoi
  // „learjet-c-21a-learjet-35a” — kod LJ35 nie występuje tam w ogóle.
  LJ35: ['learjet-35', 'learjet', 'c-21'], LJ36: ['learjet-36', 'learjet'],
  LJ45: ['learjet-45', 'learjet'], LJ60: ['learjet-60', 'learjet'],
  LJ31: ['learjet-31', 'learjet'], LJ55: ['learjet-55', 'learjet'],
  // Bombardier Global: w adresie „global-6000” albo „bd-700”, nigdy „glex”.
  GLEX: ['global-6000', 'global-5000', 'global-express', 'bd-700', 'global'],
  GL5T: ['global-5000', 'bd-700', 'global'], GL7T: ['global-7500', 'bd-700'],
  CL30: ['challenger-300'], CL35: ['challenger-350'], CL60: ['challenger-60'],
  C560: ['citation', 'uc-35'], C56X: ['citation', 'uc-35'], C550: ['citation'],
  C525: ['citation'], C510: ['citation'], C750: ['citation'],
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
      // Zgodność operatora punktuje, NIEZGODNOŚĆ odejmuje — inaczej zdjęcie
      // spod rejestracji wygrywało samym bonusem źródła, choć pokazywało
      // maszynę innego kraju. Niemiecki Global 6000 „14+05” (GAF616) dostawał
      // tak polską Iskrę TS-11 „1405”: ten sam numer bez znaku plus.
      if (link.includes(hint)) score += 50
      else score -= 40
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
// Czy w ogóle MAMY czym zweryfikować zdjęcie. Bez kodu typu i bez rozpoznanego
// operatora nie ma o co oprzeć porównania — wtedy brak sygnału nic nie znaczy
// i odrzucanie na tej podstawie gubiłoby poprawne zdjęcia.
export function canVerifyPhotoMatch(ac) {
  if (typeSlugCandidates(ac?.t).length) return true
  const callsign = (ac?.flight || '').toUpperCase()
  return OPERATOR_HINT_BY_CALLSIGN.some(([re]) => re.test(callsign))
}

// Czy adres zdjęcia zaczyna się od TEJ rejestracji. Slug planespotters ma
// postać /photo/{id}/{rejestracja}-{operator}-{model}, więc pierwszy człon jest
// twardym dowodem tożsamości płatowca — ale TYLKO wtedy, gdy sama rejestracja
// jest dowodem.
//
// Musi zawierać literę. Cywilny znak (SP-HXW, LX-N90447, N601AL) jest globalnie
// unikalny i pierwszy człon adresu rozstrzyga sprawę. Goły numer seryjny nie
// jest — i to jest dokładnie ta kolizja, przed którą ostrzega nagłówek tego
// pliku. Polski Mi-17 „630" dostawał zdjęcie izraelskiej Fougi Magister, bo jej
// adres też zaczyna się od „630-”; wcześniej ten sam mechanizm kazałby uznać
// greckiego F-16 „018" za polskiego C-295. Numer seryjny musi się obronić
// typem albo operatorem, tak jak każdy inny kandydat.
//
// Porównujemy rejestrację DOSŁOWNIE, bez usuwania myślników. To nie przeoczenie:
// polski Hercules ma numer 1510, a niemiecki Airbus 15+10 zapisany w adresie
// jako „15-10". Po znormalizowaniu myślników oba wyglądałyby tak samo i wrócilibyśmy
// do pokazywania cudzego zdjęcia.
function slugStartsWithReg(link, reg) {
  const r = (reg || '').trim().toLowerCase()
  if (r.length < 3) return false
  if (!/[a-z]/.test(r)) return false
  const m = link.match(/\/photo\/\d+\/([^/?#]+)/)
  return !!m && m[1].startsWith(r + '-')
}

export function photoHasMatchSignal(photo, ac) {
  const link = (photo.link || '').toLowerCase()
  if (!link) return false
  if (slugStartsWithReg(link, ac.reg)) return true
  const candidates = typeSlugCandidates(ac.t)
  if (candidates.length && candidates.some(c => link.includes(c))) return true
  const callsign = (ac.flight || '').toUpperCase()
  for (const [re, hint] of OPERATOR_HINT_BY_CALLSIGN) {
    if (re.test(callsign)) return link.includes(hint)
  }
  return false
}
