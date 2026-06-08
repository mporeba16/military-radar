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

  // — Przygraniczne / NATO (rzadziej, ale ruch nad PL tam ląduje) —
  { icao: 'ETNG', name: 'Geilenkirchen (NATO)', lat: 50.9608, lon: 6.0425, mil: true },
  { icao: 'EYSA', name: 'Šiauliai (Litwa)',  lat: 55.8939, lon: 23.3950, mil: true },
  { icao: 'EEEK', name: 'Ämari (Estonia)',   lat: 59.2603, lon: 24.2085, mil: true },
  { icao: 'LKCV', name: 'Čáslav (Czechy)',   lat: 49.9397, lon: 15.3819, mil: true },
  { icao: 'LKKB', name: 'Praga-Kbely',       lat: 50.1213, lon: 14.5436, mil: true },
]

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

  let best = null
  for (const ap of AIRFIELDS) {
    const dist = haversine(ac.lat, ac.lon, ap.lat, ap.lon)
    if (dist > 130) continue
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
