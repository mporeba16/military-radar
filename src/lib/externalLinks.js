// Adresy maszyny w zewnętrznych serwisach (przyciski pod kartą maszyny).

// Flightradar24 szuka lotu po znaku wywoławczym. Bez znaku (maszyna nadaje
// sam adres, a `flight` to wtedy hex) nie ma czego szukać. Wojsko FR24 często
// ukrywa — wtedy strona powie, że lotu nie ma; ADS-B Exchange pokazuje wszystko.
export function fr24Url(ac) {
  const cs = (ac?.flight || '').trim().toUpperCase()
  if (!cs || cs === String(ac?.hex || '').toUpperCase() || !/^[A-Z0-9]{2,8}$/.test(cs)) return null
  return `https://www.flightradar24.com/${cs}`
}
