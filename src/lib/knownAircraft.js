// Maszyny rozpoznane ręcznie — to, czego nie ma w ADS-B ani w bazach.
//
// ADS-B niesie tylko kod typu i (czasem) rejestrację. Dla polskich maszyn
// wojskowych kod bywa zgrubny: adsb.fi podaje MI8 zarówno dla Mi-8, jak i dla
// Mi-17, a przynależności do jednostki nie poda nigdy.
//
// Klucz to adres ICAO (hex) — jedyny identyfikator, który nie zmienia się
// w locie. Wpisy pochodzą od użytkownika i są dopisywane pojedynczo; nic tu
// nie jest zgadywane z danych.
const KNOWN = {
  // PLF751 — Mi-17 Powietrznej Jednostki Operacji Specjalnych.
  '48da45': { type: 'MI17', unit: 'PJOS', unitFull: 'Powietrzna Jednostka Operacji Specjalnych' },
  // PLF252 — polski C-130 Hercules. Ta maszyna nadaje BEZ pola typu
  // i bez rejestracji (sprawdzone w adsb.fi, adsb.lol, adsbdb i planespotters
  // 21.09.2026), więc bez tego wpisu zostawała na mapie bezimienna.
  '48d8ef': { type: 'C130' },
  // BRIO66 — N159L, Bombardier Challenger 650 ARTEMIS II armii USA: samolot
  // rozpoznania elektronicznego. ADS-B podaje CL60 jak dla zwykłego biznesjeta,
  // więc rolę (alert jak przy tankowcach) bierzemy stąd. Od użytkownika
  // 19.10.2026; potwierdzone w adsb.fi (desc „Bombardier ARTEMIS II", US ARMY).
  'a0ec98': { type: 'CL60', unit: 'ARTEMIS', unitFull: 'US Army — rozpoznanie elektroniczne ARTEMIS II', rare: 'Rozpoznanie (ARTEMIS)' },
  // GAFS73E / GAFS73H / GAFS73I — Eurofightery Luftwaffe nad Polską. Nadają
  // bez typu, rejestracji i kategorii (sprawdzone w adsb.fi 19.10.2026), więc
  // bez wpisu dostawały domyślną sylwetkę. Od użytkownika.
  '3f65e3': { type: 'EUFI' },
  '3fa9a2': { type: 'EUFI' },
  '3fac5c': { type: 'EUFI' },
  // GAFS73D (od użytkownika) i lecące z nim w szyku GAFS73A, GAFS73C — ta sama
  // pozycja, wysokość i prędkość nad Poznaniem 19.10.2026, też bez typu.
  '3eacaf': { type: 'EUFI' },
  '3e93b5': { type: 'EUFI' },
  '3e8f71': { type: 'EUFI' },
  // GAFS73M (od użytkownika) — kolejny z tej serii nad Odrą.
  '3f91f1': { type: 'EUFI' },
  // Niemiecki P-8A Poseidon „63+02" (Marineflieger). Baza adsb.fi ma pod tym
  // adresem stary wpis — motoszybowiec SF25 D-KNIT — więc typ i rejestrację
  // trzeba NADPISAĆ (`fixDb`), a nie tylko uzupełnić. Od użytkownika
  // 20.10.2026; zdjęcie w planespotters pod tym hexem potwierdza.
  '3e7f27': { type: 'P8', reg: '63+02', fixDb: true },
}

// Typ po znaku wywoławczym — dla całych serii, gdzie hexy zmieniają się z lotu
// na lot. GAFS73* to TLG 73 „Steinhoff" z Laage, skrzydło szkoleniowe
// Eurofighterów (innych maszyn nie ma); nadają bez typu, więc bez reguły każdy
// nowy egzemplarz trzeba by dopisywać osobno.
const CALLSIGN_TYPES = [
  [/^GAFS73[A-Z]?$/, 'EUFI'],
]

export function typeFromCallsign(flight) {
  const cs = String(flight || '').trim().toUpperCase()
  return CALLSIGN_TYPES.find(([re]) => re.test(cs))?.[1] || null
}

export function knownAircraft(hex) {
  return KNOWN[String(hex || '').toLowerCase()] || null
}

// Typ do opisu maszyny: nasz wpis ma pierwszeństwo przed kodem z ADS-B.
// `fixDb`: baza ADS-B ma pod tym adresem inną maszynę — nasz wpis wygrywa
// także z niepustym typem i rejestracją z rekordu.
export function resolvedType(ac) {
  return knownAircraft(ac?.hex)?.type || ac?.t || typeFromCallsign(ac?.flight) || ''
}

// Uzupełnia rekord o rozpoznany typ u samego wejścia danych. Karta radziła
// sobie sama (woła resolvedType), ale sylwetka na mapie, etykieta i tytuł
// powiadomienia czytają ac.t — i dla maszyny nadającej bez typu pokazywały
// pustkę. Stąd jedno miejsce, przez które przechodzą wszystkie rekordy.
export function applyKnown(ac) {
  const known = knownAircraft(ac?.hex)
  if (known?.fixDb) {
    return { ...ac, t: known.type || ac.t, desc: null, ...(known.reg ? { reg: known.reg } : {}) }
  }
  if (ac?.t) return ac
  const type = known?.type || typeFromCallsign(ac?.flight)
  return type ? { ...ac, t: type } : ac
}
