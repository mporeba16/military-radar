// Lotniska i bazy lotnicze — do heurystycznej oceny „gdzie maszyna ląduje".
// Tylko współrzędne + nazwa; źródłem prawdy jest trajektoria samolotu.
// Lista skupiona na Polsce (bazy wojskowe + lotniska cywilne) z kilkoma
// punktami przygranicznymi, gdzie ląduje ruch widoczny nad PL.

export const AIRFIELDS = [
  // — Polskie bazy wojskowe —
  { icao: 'EPKS', name: 'Poznań-Krzesiny',   lat: 52.1331, lon: 16.9665, mil: true },
  { icao: 'EPLK', name: 'Łask',              lat: 51.5517, lon: 19.1791, mil: true },
  { icao: 'EPMM', name: 'Mińsk Mazowiecki',  lat: 52.1955, lon: 21.6556, mil: true },
  { icao: 'EPPW', name: 'Powidz',            lat: 52.3794, lon: 17.8539, mil: true },
  { icao: 'EPMI', name: 'Mirosławiec',       lat: 53.3953, lon: 16.0828, mil: true },
  { icao: 'EPSN', name: 'Świdwin',           lat: 53.7906, lon: 15.8264, mil: true },
  { icao: 'EPMB', name: 'Malbork',           lat: 54.0269, lon: 19.1342, mil: true },
  { icao: 'EPDE', name: 'Dęblin',            lat: 51.5514, lon: 21.8937, mil: true },
  { icao: 'EPIR', name: 'Inowrocław',        lat: 52.7991, lon: 18.3306, mil: true },
  { icao: 'EPPR', name: 'Pruszcz Gdański',   lat: 54.2480, lon: 18.6719, mil: true },
  { icao: 'EPCE', name: 'Siemirowice',       lat: 54.4783, lon: 17.7211, mil: true },
  { icao: 'EPTM', name: 'Tomaszów (Nowe Miasto)', lat: 51.6189, lon: 20.5378, mil: true },

  // — Polskie lotniska cywilne / wspólne —
  { icao: 'EPWA', name: 'Warszawa-Okęcie',   lat: 52.1657, lon: 20.9671 },
  { icao: 'EPMO', name: 'Warszawa-Modlin',   lat: 52.4511, lon: 20.6518 },
  { icao: 'EPKK', name: 'Kraków-Balice',     lat: 50.0777, lon: 19.7848 },
  { icao: 'EPRZ', name: 'Rzeszów-Jasionka',  lat: 50.1100, lon: 22.0190 },
  { icao: 'EPRA', name: 'Radom',             lat: 51.3892, lon: 21.2133 },
  { icao: 'EPGD', name: 'Gdańsk',            lat: 54.3776, lon: 18.4662 },
  { icao: 'EPPO', name: 'Poznań-Ławica',     lat: 52.4210, lon: 16.8263 },
  { icao: 'EPWR', name: 'Wrocław',           lat: 51.1027, lon: 16.8858 },
  { icao: 'EPKT', name: 'Katowice-Pyrzowice',lat: 50.4743, lon: 19.0800 },
  { icao: 'EPLB', name: 'Lublin',            lat: 51.2403, lon: 22.7136 },
  { icao: 'EPBY', name: 'Bydgoszcz',         lat: 53.0968, lon: 17.9777 },
  { icao: 'EPSC', name: 'Szczecin-Goleniów', lat: 53.5847, lon: 14.9022 },
  { icao: 'EPLL', name: 'Łódź',              lat: 51.7219, lon: 19.3981 },
  { icao: 'EPZG', name: 'Zielona Góra',      lat: 52.1385, lon: 15.7986 },

  // — Przygraniczne (ruch nad PL tam ląduje) —
  { icao: 'LKKB', name: 'Praga-Kbely',       lat: 50.1213, lon: 14.5436, mil: true },

  // — Główne bazy lotnicze NATO w Europie —
  // Współrzędne z OurAirports (domena publiczna), nie z pamięci. `nato: true`
  // rysuje je na mapie osobną warstwą; `mil: true` włącza je do szacowania
  // lotniska lądowania, więc maszyna schodząca nad Nadrenią wskaże Ramstein,
  // a nie najbliższe polskie lotnisko.
  // Niemcy
  { icao: 'ETAR', name: 'Ramstein',          lat: 49.4369, lon: 7.6003,  mil: true, nato: true },
  { icao: 'ETAD', name: 'Spangdahlem',       lat: 49.9765, lon: 6.6984,  mil: true, nato: true },
  { icao: 'ETNG', name: 'Geilenkirchen (NATO AWACS)', lat: 50.9608, lon: 6.0424, mil: true, nato: true },
  { icao: 'ETNL', name: 'Rostock-Laage',     lat: 53.9182, lon: 12.2783, mil: true, nato: true },
  { icao: 'ETNS', name: 'Schleswig-Jagel',   lat: 54.4593, lon: 9.5163,  mil: true, nato: true },
  { icao: 'ETNT', name: 'Wittmundhafen',     lat: 53.5478, lon: 7.6673,  mil: true, nato: true },
  { icao: 'ETNW', name: 'Wunstorf',          lat: 52.4573, lon: 9.4272,  mil: true, nato: true },
  { icao: 'ETSN', name: 'Neuburg',           lat: 48.7110, lon: 11.2115, mil: true, nato: true },
  // Beneluks
  { icao: 'EHVK', name: 'Volkel',            lat: 51.6572, lon: 5.7078,  mil: true, nato: true },
  { icao: 'EHLW', name: 'Leeuwarden',        lat: 53.2286, lon: 5.7606,  mil: true, nato: true },
  { icao: 'EBBL', name: 'Kleine Brogel',     lat: 51.1683, lon: 5.4700,  mil: true, nato: true },
  { icao: 'EBFS', name: 'Florennes',         lat: 50.2433, lon: 4.6458,  mil: true, nato: true },
  // Wielka Brytania
  { icao: 'EGUL', name: 'RAF Lakenheath',    lat: 52.4095, lon: 0.5612,  mil: true, nato: true },
  { icao: 'EGUN', name: 'RAF Mildenhall',    lat: 52.3619, lon: 0.4864,  mil: true, nato: true },
  { icao: 'EGVA', name: 'RAF Fairford',      lat: 51.6836, lon: -1.7892, mil: true, nato: true },
  { icao: 'EGVN', name: 'RAF Brize Norton',  lat: 51.7500, lon: -1.5836, mil: true, nato: true },
  { icao: 'EGXC', name: 'RAF Coningsby',     lat: 53.0930, lon: -0.1660, mil: true, nato: true },
  { icao: 'EGQS', name: 'RAF Lossiemouth',   lat: 57.7052, lon: -3.3392, mil: true, nato: true },
  // Francja / Włochy
  { icao: 'LFSI', name: 'Saint-Dizier',      lat: 48.6360, lon: 4.8994,  mil: true, nato: true },
  { icao: 'LFMI', name: 'Istres-Le Tubé',    lat: 43.5227, lon: 4.9238,  mil: true, nato: true },
  { icao: 'LIPA', name: 'Aviano',            lat: 46.0319, lon: 12.5965, mil: true, nato: true },
  { icao: 'LICZ', name: 'Sigonella',         lat: 37.4017, lon: 14.9224, mil: true, nato: true },
  // Półwysep Iberyjski / Atlantyk
  { icao: 'LERT', name: 'Rota',              lat: 36.6452, lon: -6.3495, mil: true, nato: true },
  { icao: 'LEMO', name: 'Morón',             lat: 37.1749, lon: -5.6159, mil: true, nato: true },
  { icao: 'LPLA', name: 'Lajes (Azory)',     lat: 38.7618, lon: -27.0908, mil: true, nato: true },
  { icao: 'BIKF', name: 'Keflavík',          lat: 63.9850, lon: -22.6056, mil: true, nato: true },
  // Skandynawia / Finlandia
  { icao: 'ENOL', name: 'Ørland',            lat: 63.6989, lon: 9.6040,  mil: true, nato: true },
  { icao: 'ENBO', name: 'Bodø',              lat: 67.2692, lon: 14.3653, mil: true, nato: true },
  { icao: 'ESPA', name: 'Luleå-Kallax',      lat: 65.5438, lon: 22.1220, mil: true, nato: true },
  { icao: 'ESDF', name: 'Ronneby',           lat: 56.2667, lon: 15.2650, mil: true, nato: true },
  { icao: 'EFRO', name: 'Rovaniemi',         lat: 66.5633, lon: 25.8298, mil: true, nato: true },
  { icao: 'EFKU', name: 'Kuopio-Rissala',    lat: 63.0071, lon: 27.7978, mil: true, nato: true },
  // Flanka wschodnia — Bałtyk
  { icao: 'EYSA', name: 'Šiauliai',          lat: 55.8939, lon: 23.3950, mil: true, nato: true },
  { icao: 'EEEI', name: 'Ämari',             lat: 59.2596, lon: 24.2048, mil: true, nato: true },
  { icao: 'EVGA', name: 'Lielvārde',         lat: 56.7783, lon: 24.8539, mil: true, nato: true },
  // Flanka wschodnia — Europa Środkowa i Południowa
  { icao: 'LKCV', name: 'Čáslav',            lat: 49.9397, lon: 15.3818, mil: true, nato: true },
  { icao: 'LKNA', name: 'Náměšť',            lat: 49.1663, lon: 16.1240, mil: true, nato: true },
  { icao: 'LZSL', name: 'Sliač',             lat: 48.6378, lon: 19.1341, mil: true, nato: true },
  { icao: 'LHKE', name: 'Kecskemét',         lat: 46.9175, lon: 19.7492, mil: true, nato: true },
  { icao: 'LHPA', name: 'Pápa (NATO HAW)',   lat: 47.3636, lon: 17.5008, mil: true, nato: true },
  { icao: 'LRCK', name: 'Mihail Kogălniceanu', lat: 44.3622, lon: 28.4883, mil: true, nato: true },
  { icao: 'LBPG', name: 'Graf Ignatiewo',    lat: 42.2904, lon: 24.7140, mil: true, nato: true },
  { icao: 'LDZD', name: 'Zemunik / Zadar',   lat: 44.0970, lon: 15.3536, mil: true, nato: true },
  { icao: 'LGSA', name: 'Souda Bay',         lat: 35.5312, lon: 24.1507, mil: true, nato: true },
  { icao: 'LGAD', name: 'Andrawida',         lat: 37.9207, lon: 21.2926, mil: true, nato: true },
  { icao: 'LTAG', name: 'Incirlik',          lat: 37.0021, lon: 35.4259, mil: true, nato: true },
]

// Dwie statyczne warstwy mapy, rysowane osobno i osobno przełączane: polskie
// bazy to treść lokalna, bazy NATO rozciągają się od Azorów po Incirlik i przy
// widoku na Polskę byłyby tylko szumem, gdyby nie dało się ich zgasić.
export const MIL_BASES_PL = AIRFIELDS.filter(a => a.mil && a.icao.startsWith('EP'))
export const MIL_BASES_NATO = AIRFIELDS.filter(a => a.nato)

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Heurystyka „prawdopodobne lotnisko lądowania":
// maszyna musi SCHODZIĆ (lub być już nisko) i mieć kurs nacelowany na lotnisko
// w stożku, którego rozwartość maleje z odległością. Im bliżej i niżej, tym
// pewniej — dlatego zwracamy też flagę `onApproach` do mocniejszego komunikatu.
//
// Zwraca { icao, name, distKm, offDeg, onApproach } albo null.
export function findLikelyLanding(ac) {
  if (!ac || ac.lat == null || ac.lon == null || ac.track == null) return null
  if (ac.on_ground) return null
  const alt = ac.alt_baro          // ft
  const vs = ac.baro_rate          // ft/min

  const descending = vs != null && vs < -200 && alt != null && alt < 16000
  const lowFinal = alt != null && alt < 4000
  if (!descending && !lowFinal) return null

  // Gdy maszyna realnie schodzi, dopuszczamy lotnisko na całym profilu zniżania
  // (do 130 km). Gdy jest tylko nisko, ale NIE schodzi (przelot na małej
  // wysokości, śmigłowiec), to słaba przesłanka — akceptujemy tylko bliskie
  // lotnisko (final/krąg), żeby nie wskazywać celu 100 km dalej.
  const maxDist = descending ? 130 : 30

  let best = null
  for (const ap of AIRFIELDS) {
    const dist = haversine(ac.lat, ac.lon, ap.lat, ap.lon)
    if (dist > maxDist) continue
    const brgTo = bearing(ac.lat, ac.lon, ap.lat, ap.lon)
    const off = Math.abs(((brgTo - ac.track + 540) % 360) - 180)  // 0..180°
    // Stożek: blisko (turn na finał) luźniej, daleko ciaśniej.
    const maxOff = dist < 25 ? 55 : dist < 60 ? 35 : 22
    if (off > maxOff) continue
    const score = dist + off * 1.5   // preferuj bliskie i dobrze wyrównane
    if (!best || score < best.score) {
      best = {
        icao: ap.icao, name: ap.name,
        distKm: Math.round(dist), offDeg: Math.round(off),
        onApproach: dist < 40 && alt != null && alt < 6000,
        score,
      }
    }
  }
  if (!best) return null
  delete best.score
  return best
}
