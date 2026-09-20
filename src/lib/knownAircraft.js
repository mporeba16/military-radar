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
}

export function knownAircraft(hex) {
  return KNOWN[String(hex || '').toLowerCase()] || null
}

// Typ do opisu maszyny: nasz wpis ma pierwszeństwo przed kodem z ADS-B.
export function resolvedType(ac) {
  return knownAircraft(ac?.hex)?.type || ac?.t || ''
}
