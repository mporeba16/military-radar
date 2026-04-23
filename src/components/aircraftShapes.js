// Ikony wzorowane na zestawie dump1090/ADS-B Exchange
// Centrum (0,0), nos skierowany w GÓRĘ (track=0 = północ), widok z góry
// ViewBox "-20 -20 40 40" → ikona 40×40 px

export const SHAPES = {

  // ── Odrzutowce ─────────────────────────────────────────────────────────────

  // Wąskokadłubowy (A320, B737, F-16 transport-class)
  jet:
    'M0,-19 L1.5,-10 L13,2 L13,4 L1.5,0 L2,10 L7,13 L7,15 L0,13 L-7,15 L-7,13 L-2,10 L-1.5,0 L-13,4 L-13,2 L-1.5,-10 Z',

  // Szerokokadłubowy (B747, B777, A380, C-5)
  heavy:
    'M0,-19 L2,-7 L15,4 L15,7 L2,3 L3,12 L7,15 L7,16 L0,15 L-7,16 L-7,15 L-3,12 L-2,3 L-15,7 L-15,4 L-2,-7 Z',

  // 4-silnikowy (B747/A340 — silniki widoczne jako zgrubienia)
  quad:
    'M0,-19 L2,-7 L15,4 L15,6 L11,5 L11,7 L2,3 L3,12 L7,15 L7,16 L0,15 L-7,16 L-7,15 L-3,12 L-2,3 L-11,7 L-11,5 L-15,6 L-15,4 L-2,-7 Z',

  // ── Myśliwce ───────────────────────────────────────────────────────────────

  // Skośne skrzydła (F-16, F/A-18, MiG-29)
  fighter:
    'M0,-19 L2.5,-2 L14,10 L12,13 L0,8 L-12,13 L-14,10 L-2.5,-2 Z ' +
    'M0,8 L1.5,14 L0,13 L-1.5,14 Z',

  // Delta (F-22, Eurofighter, Rafale, Su-27/35)
  delta:
    'M0,-19 L3,5 L16,15 L13,17 L0,11 L-13,17 L-16,15 L-3,5 Z ' +
    'M-2,11 L2,11 L2,17 L0,16 L-2,17 Z',

  // Skrzydło latające / B-2 (brak wyraźnego kadłuba)
  flyingwing:
    'M0,-12 L4,2 L19,8 L18,11 L9,9 L4,15 L-4,15 L-9,9 L-18,11 L-19,8 L-4,2 Z',

  // ── Transporty wojskowe ────────────────────────────────────────────────────

  // Proste, wysoko osadzone skrzydła — C-130 Hercules (2 silniki)
  transport:
    'M0,-17 L2,-3 L16,3 L16,5 L8,4 L8,6 L2,5 L2,12 L5,14 L5,15 L0,14 L-5,15 L-5,14 L-2,12 L-2,5 L-8,6 L-8,4 L-16,5 L-16,3 L-2,-3 Z',

  // C-130 4-śmigłowy
  transport4:
    'M0,-17 L2,-3 L17,3 L17,5 L12,4 L12,6 L7,4 L7,6 L2,5 L2,12 L5,14 L5,15 L0,14 L-5,15 L-5,14 L-2,12 L-2,5 L-7,6 L-7,4 L-12,6 L-12,4 L-17,5 L-17,3 L-2,-3 Z',

  // C-17 / AN-124 — T-ogon, proste skrzydła
  strategic:
    'M0,-18 L2,-4 L18,4 L18,7 L2,5 L3,13 L7,15 L7,17 L0,16 L-7,17 L-7,15 L-3,13 L-2,5 L-18,7 L-18,4 L-2,-4 Z',

  // ── Tankowce ───────────────────────────────────────────────────────────────

  // KC-135, KC-10 — jak heavy, wysięgnik z tyłu
  tanker:
    'M0,-19 L2,-7 L17,5 L17,8 L2,3 L3,12 L8,15 L8,16 L1,15 L1,19 L-1,19 L-1,15 L-8,16 L-8,15 L-3,12 L-2,3 L-17,8 L-17,5 L-2,-7 Z',

  // ── Patrolowe / rozpoznawcze ───────────────────────────────────────────────

  // P-8, P-3, E-3, RC-135 — jak jet z gondolami
  patrol:
    'M0,-19 L1.5,-10 L13,2 L13,4 L9,3 L9,5 L1.5,0 L2,10 L7,13 L7,15 L0,13 L-7,15 L-7,13 L-2,10 L-1.5,0 L-9,5 L-9,3 L-13,4 L-13,2 L-1.5,-10 Z',

  // ── Turbośmigłowe ──────────────────────────────────────────────────────────

  // ATR, DHC-8, C-295 — proste skrzydła, śmigło na nosie
  turboprop:
    'M0,-14 L1.5,-6 L10,0 L10,2 L1.5,0 L1.5,8 L4,10 L4,12 L0,11 L-4,12 L-4,10 L-1.5,8 L-1.5,0 L-10,2 L-10,0 L-1.5,-6 Z ' +
    'M-6,-15 L6,-15 L6,-14 L-6,-14 Z',

  // Twin turboprop (King Air, C-12) — 2 śmigła
  twin:
    'M0,-14 L1.5,-6 L10,0 L10,2 L7,1 L7,3 L1.5,1 L1.5,8 L4,10 L4,12 L0,11 L-4,12 L-4,10 L-1.5,8 L-1.5,1 L-7,3 L-7,1 L-10,2 L-10,0 L-1.5,-6 Z',

  // ── Śmigłowce ─────────────────────────────────────────────────────────────

  // Jednowirnikowy (UH-60, AH-64, Mi-8, W-3)
  helicopter:
    // Kadłub — dominujący element
    'M-4,-9 L4,-9 L5.5,6 L3,11 L0,12 L-3,11 L-5.5,6 Z ' +
    // Główny wirnik — krótsze ramiona (±11 zamiast ±17)
    'M-11,-2 L11,-2 L11,-0.5 L-11,-0.5 Z ' +
    'M-8,-6 L8,2 L8,3.5 L-8,-4.5 Z ' +
    // Belka ogonowa
    'M-1,9 L1,9 L1.5,16 L-1.5,16 Z ' +
    // Wirnik ogonowy
    'M1.5,14 L4.5,14 L4.5,16 L1.5,16 Z',

  // Dwuwirnikowy tandem (CH-47 Chinook)
  tandem:
    // Kadłub (wysoki i wyraźny)
    'M-4,-12 L4,-12 L5,12 L4,15 L-4,15 L-5,12 Z ' +
    // Przedni wirnik (±10)
    'M-10,-10 L10,-10 L10,-8.5 L-10,-8.5 Z ' +
    'M-7,-14 L7,-6 L7,-4.5 L-7,-12.5 Z ' +
    // Tylny wirnik (±10)
    'M-10,8 L10,8 L10,9.5 L-10,9.5 Z ' +
    'M-7,4 L7,12 L7,13.5 L-7,5.5 Z',

  // ── Drony / UAV ───────────────────────────────────────────────────────────

  // MQ-9, Global Hawk — duże skrzydła, mały kadłub
  uav:
    'M0,-10 L2,-2 L18,2 L18,4 L2,2 L2,10 L0,8 L-2,10 L-2,2 L-18,4 L-18,2 L-2,-2 Z',

  // Mały dron (quadcopter style)
  drone:
    'M0,-14 L2.5,-2 L11,3 L2.5,0 L2.5,14 L0,11 L-2.5,14 L-2.5,0 L-11,3 L-2.5,-2 Z ' +
    'M-1,-1 L1,-1 L1,1 L-1,1 Z',

  // ── Lżejsze od powietrza ──────────────────────────────────────────────────

  // Sterowiec / balon na ogrzane powietrze
  airship:
    'M0,-18 C10,-18 15,-8 15,0 C15,10 8,17 0,17 C-8,17 -15,10 -15,0 C-15,-8 -10,-18 0,-18 Z ' +
    'M-3,17 L-3,20 L3,20 L3,17 Z',
}

// ── Mapowanie typu ICAO → kształt ─────────────────────────────────────────────

export function getShapeKey(t) {
  const type = (t || '').toUpperCase().replace(/[-\s]/g, '')

  // Sterowce / balony
  if (/BLIMP|ZEPPELIN|AIRSHIP|BALLOON|^LZ|^ZS/.test(type)) return 'airship'

  // Drony
  if (/^MQ9|^MQ1|^RQ4|^RQ7|^RQ170|REAPER|PREDATOR|GLOBALHAWK|TRITON|HERON|HERMES|WATCHKEEPER/.test(type))
    return 'uav'
  if (/^QUAD|^DJI|^PHANTOM|UAV|UAS/.test(type)) return 'drone'

  // Śmigłowce
  if (/CH47|CHINOOK|MH47/.test(type)) return 'tandem'
  if (/^UH|^AH|^CH|^MH|^HH|^SH|^EC\d|^AS3|^W3|^MI|^KA|LYNX|PUMA|TIGER|MERLIN|SEAHAWK|BLACKHAWK|APACHE|WILDCAT|COUGAR|DAUPHIN|SUPER PUMA/.test(type))
    return 'helicopter'

  // Myśliwce skrzydło delta
  if (/^F22|^F35|EF2000|TYPHOON|RAFALE|^JAS39|GRIPEN|^B2|SPIRIT|^F117/.test(type)) return 'delta'
  if (/^B2|STEALTH|FLYINGWING/.test(type)) return 'flyingwing'

  // Myśliwce skrzydła skośne
  if (/^F16|^F15|^FA18|^F18|^MIG|^SU[2-9]|^SU1[0-9]|HORNET|VIPER|FLANKER|FULCRUM|HAWK\s?T|^A10|THUNDERBOLT/.test(type))
    return 'fighter'

  // Tankowce
  if (/^KC135|^KC10|^KC46|MRTT|^A330MRT|VCATA/.test(type)) return 'tanker'

  // Transport strategiczny
  if (/^C17|^AN124|^AN225|^IL76|^C5/.test(type)) return 'strategic'

  // Transport taktyczny 4-śmigłowy
  if (/^C130|^C160|^AN12|^IL18|^E3/.test(type)) return 'transport4'

  // Transport 2-śmigłowy / CASA
  if (/^C295|^CASA|^AN26|^AN32|^C212/.test(type)) return 'transport'

  // Patrolowe / rozpoznawcze
  if (/^P8|^P3|ORION|POSEIDON|^E3|AWACS|SENTINEL|^RC135|^EP3|^E8|JSTARS/.test(type)) return 'patrol'

  // Turbośmigłowe twin
  if (/^BE|^C12|KINGAIR|^PC12|^DHC8|DASH8/.test(type)) return 'twin'

  // Turbośmigłowe single
  if (/^ATR|^PC6|^DHC|CARAVAN|^C208|C295M/.test(type)) return 'turboprop'

  // Szerokokadłubowe 4-silnikowe
  if (/^B744|^B747|^A340|^A380|^IL96/.test(type)) return 'quad'

  // Szerokokadłubowe
  if (/^B74|^B77|^B78|^B76|^A38|^A34|^A33|^A35|^C5/.test(type)) return 'heavy'

  // Domyślnie: wąskokadłubowy odrzutowiec
  return 'jet'
}

// ── Kolor wg wysokości (gradient jak globe.adsbexchange.com) ─────────────────

export function altToColor(altM) {
  if (altM == null) return '#aaaaaa'

  const stops = [
    [    0, [255,  20,  20]],
    [  600, [255,  90,   0]],
    [ 1500, [255, 140,   0]],
    [ 3000, [255, 215,   0]],
    [ 4600, [160, 230,   0]],
    [ 6100, [  0, 200,  20]],
    [ 7600, [  0, 215, 180]],
    [ 9100, [  0, 200, 255]],
    [10700, [ 40, 130, 255]],
    [12200, [ 80,  60, 255]],
    [15200, [180,   0, 255]],
  ]

  const alt = Math.max(0, Math.min(altM, 15200))
  for (let i = 0; i < stops.length - 1; i++) {
    const [a0, c0] = stops[i], [a1, c1] = stops[i + 1]
    if (alt >= a0 && alt <= a1) {
      const t = (alt - a0) / (a1 - a0)
      return `rgb(${Math.round(c0[0]+(c1[0]-c0[0])*t)},${Math.round(c0[1]+(c1[1]-c0[1])*t)},${Math.round(c0[2]+(c1[2]-c0[2])*t)})`
    }
  }
  return 'rgb(180,0,255)'
}

// ── Konwersje ────────────────────────────────────────────────────────────────

export const ftToM   = ft => ft  != null ? Math.round(ft  * 0.3048) : null
export const knToKmh = kn => kn  != null ? Math.round(kn  * 1.852)  : null
