// Zdjęcia poglądowe TYPU maszyny — ostatnia deska ratunku, gdy planespotters
// nie ma zdjęcia konkretnego płatowca (np. polski Mi-8/Mi-17 „655”, PLF751).
//
// To NIE jest ta maszyna, więc karta musi to powiedzieć wprost: podpis
// „zdjęcie poglądowe”, autor i licencja. Wchodzą tu wyłącznie zdjęcia, które
// wolno rozpowszechniać (domena publiczna albo licencja Creative Commons) —
// pliki leżą w public/photos/, żeby nie obciążać cudzych serwerów.

const PHOTOS = [
  {
    // Litewski L-410 UVP „02" — planespotters pod tą rejestracją ma ukraińskiego
    // An-26 (rejestracje z dwóch cyfr nie są unikalne na świecie), więc zdjęcie
    // musi przyjść stąd. To ten sam egzemplarz, który lata jako LF345.
    match: /^L410$/,
    hex: '503fd9',
    src: '/photos/l410-lt.jpg',
    author: 'Anna Zvereva',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Lithuanian_Air_Force,_02,_Let_L-410UVP_Turbolet.jpg',
  },
  {
    // adsb.fi podaje MI8 także dla Mi-17 (eksportowy Mi-8MT) — jedna rodzina.
    match: /^(MI8|MI17|MI171)$/,
    src: '/photos/mi17-pl.jpg',
    author: 'Alf van Beem',
    license: 'domena publiczna',
    source: 'https://commons.wikimedia.org/wiki/File:Mil_Mi-17-1V,_Polish_Army,_6107,_Belgian_Air_Force_Days_2018.jpg',
  },
]

export function typePhoto(t) {
  const type = String(t || '').trim().toUpperCase()
  if (!type) return null
  return PHOTOS.find(p => p.match.test(type)) || null
}

// Czy to zdjęcie akurat TEJ maszyny, a nie innej tego samego typu. Podpis musi
// mówić prawdę w obie strony: „poglądowe" pod zdjęciem właśnie tego egzemplarza
// byłoby równie mylące, co odwrotnie.
export function isSameAirframe(photo, hex) {
  return !!photo?.hex && photo.hex === String(hex || '').toLowerCase()
}
