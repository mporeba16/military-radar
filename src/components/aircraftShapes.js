// Ikony wzorowane na zestawie ADS-B Exchange / dump1090 / tar1090
// Centrum (0,0), nos skierowany w GÓRĘ, widok z góry
// ViewBox "-22 -22 44 44" → 44×44 px
//
// Zasady proporcji:
//  - kadłub to dominujący element ikony
//  - rozpiętość skrzydeł ≤ 85% długości kadłuba
//  - minimalna ilość punktów aby kształt był gładki i rozpoznawalny

export const SHAPES = {

  // ── Odrzutowce ─────────────────────────────────────────────────────────────

  // Wąskokadłubowy (A320, B737, większość wojskowych jetów)
  jet: 'M0,-19 L1.5,-11 L2,-4 '    // nos → prawy kadłub → nasada skrzydła
     + 'L13,-1 L12,3 '              // prawe skrzydło: krawędź natarcia, spływu
     + 'L2.5,1 L2.5,9 '            // powrót do kadłuba
     + 'L7,11 L6.5,13 '            // prawe usterzenie poziome
     + 'L0,12 '                     // koniec ogona
     + 'L-6.5,13 L-7,11 '
     + 'L-2.5,9 L-2.5,1 '
     + 'L-12,3 L-13,-1 '
     + 'L-2,-4 L-1.5,-11 Z',

  // Szerokokadłubowy (B777, A330, KC-10)
  heavy: 'M0,-19 L2,-7 L15,3 L15,6 '
       + 'L2.5,2 L3,11 L8,14 L8,15 '
       + 'L0,14 '
       + 'L-8,15 L-8,14 L-3,11 '
       + 'L-2.5,2 L-15,6 L-15,3 L-2,-7 Z',

  // 4-silnikowy (B747, A380, A340)
  quad: 'M0,-19 L2,-7 L14,3 L14,5 L10,4 L10,6 '
      + 'L2.5,2 L3,11 L7,14 L7,16 '
      + 'L0,14 '
      + 'L-7,16 L-7,14 L-3,11 '
      + 'L-2.5,2 L-10,6 L-10,4 L-14,5 L-14,3 L-2,-7 Z',

  // ── Myśliwce ───────────────────────────────────────────────────────────────

  // Skrzydła skośne — F-16, F/A-18, MiG-29, Su-27
  // Wyraźny kadłub, skrzydła ~70% długości kadłuba
  fighter: 'M0,-19 L2,-8 '          // nos
         + 'L2.5,-3 L12,5 L10,8 '  // prawe skrzydło
         + 'L2.5,4 L3,11 '         // kadłub za skrzydłem
         + 'L6,13 L5,15 '          // prawe usterzenie
         + 'L1.5,14 L1.5,18 L0,17 L-1.5,18 L-1.5,14 '  // statecznik pionowy
         + 'L-5,15 L-6,13 '
         + 'L-3,11 L-2.5,4 '
         + 'L-10,8 L-12,5 L-2.5,-3 L-2,-8 Z',

  // Delta — F-22, Eurofighter, Rafale, Mirage
  delta: 'M0,-20 L2.5,0 '           // ostry nos, prawy kadłub
       + 'L14,13 L11,16 '           // prawe skrzydło delta
       + 'L0,10 '                   // tył kadłuba
       + 'L-11,16 L-14,13 '
       + 'L-2.5,0 Z '
       // Canard (małe skrzydełko z przodu)
       + 'M2,-9 L7,-4 L6.5,-3 L2,-7 Z '
       + 'M-2,-9 L-7,-4 L-6.5,-3 L-2,-7 Z '
       // Statecznik pionowy
       + 'M0,10 L1.5,16 L0,15 L-1.5,16 Z',

  // Skrzydło latające — B-2 Spirit
  flyingwing: 'M0,-10 L3,0 L19,7 L18,10 L9,8 L4,14 L-4,14 L-9,8 L-18,10 L-19,7 L-3,0 Z',

  // ── Transporty wojskowe ────────────────────────────────────────────────────

  // Dwusilnikowy turboŚmigłowy transport — CASA, C-295, AN-26
  transport: 'M0,-16 L2,-3 L14,2 L14,4 L9,3 L9,5 '
           + 'L2,4 L2,11 L5,13 L5,15 '
           + 'L0,14 '
           + 'L-5,15 L-5,13 L-2,11 '
           + 'L-2,4 L-9,5 L-9,3 L-14,4 L-14,2 L-2,-3 Z',

  // C-130 Hercules — 4 śmigła, proste skrzydła
  transport4: 'M0,-16 L2,-2 L15,2 L15,4 L11,3 L11,5 L7,4 L7,6 '
            + 'L2,5 L2,12 L5,14 L5,16 '
            + 'L0,15 '
            + 'L-5,16 L-5,14 L-2,12 '
            + 'L-2,5 L-7,6 L-7,4 L-11,5 L-11,3 L-15,4 L-15,2 L-2,-2 Z',

  // C-17 / IL-76 — transport strategiczny, wysoko skrzydła, T-ogon
  strategic: 'M0,-18 L2,-5 L16,4 L16,7 '
           + 'L2.5,3 L3,12 L7,15 L7,17 '
           + 'L0,16 '
           + 'L-7,17 L-7,15 L-3,12 '
           + 'L-2.5,3 L-16,7 L-16,4 L-2,-5 Z',

  // ── Tankowce ───────────────────────────────────────────────────────────────

  // KC-135, KC-46 — jak heavy z wysięgnikiem paliwa
  tanker: 'M0,-19 L2,-7 L15,3 L15,6 '
        + 'L2.5,2 L3,11 L8,14 L8,15 '
        + 'L1,14 L1,20 L-1,20 L-1,14 '   // wysięgnik paliwa
        + 'L-8,15 L-8,14 L-3,11 '
        + 'L-2.5,2 L-15,6 L-15,3 L-2,-7 Z',

  // ── Patrolowe / ISR ───────────────────────────────────────────────────────

  // P-8, E-3, RC-135 — jak jet z gondolami silników pod skrzydłami
  patrol: 'M0,-19 L1.5,-11 L2,-4 '
        + 'L13,-1 L12,3 L9,2 L9,4 '     // gondola silnika
        + 'L2.5,1 L2.5,9 '
        + 'L7,11 L6.5,13 '
        + 'L0,12 '
        + 'L-6.5,13 L-7,11 '
        + 'L-2.5,9 L-2.5,1 '
        + 'L-9,4 L-9,2 L-12,3 L-13,-1 '
        + 'L-2,-4 L-1.5,-11 Z',

  // ── Turbośmigłowe ──────────────────────────────────────────────────────────

  // ATR, DHC-8, C-295 — proste skrzydła, pojedyncze śmigło
  turboprop: 'M0,-13 L1.5,-7 L10,-1 L10,1 '
           + 'L1.5,-0.5 L1.5,8 L4,10 L4,12 '
           + 'L0,11 '
           + 'L-4,12 L-4,10 L-1.5,8 '
           + 'L-1.5,-0.5 L-10,1 L-10,-1 L-1.5,-7 Z '
           + 'M-5,-14 L5,-14 L5,-13 L-5,-13 Z',  // śmigło

  // King Air, C-12 — 2 śmigła
  twin: 'M0,-13 L1.5,-7 L10,-1 L10,1 L7,0 L7,2 '
      + 'L1.5,0.5 L1.5,8 L4,10 L4,12 '
      + 'L0,11 '
      + 'L-4,12 L-4,10 L-1.5,8 '
      + 'L-1.5,0.5 L-7,2 L-7,0 L-10,1 L-10,-1 L-1.5,-7 Z',

  // ── Śmigłowce ─────────────────────────────────────────────────────────────

  // Jednowirnikowy — UH-60, AH-64, W-3, Mi-8
  // Zasada: kadłub dominuje, wirnik ±10 (zamiast ±17)
  helicopter:
    // Kadłub — wyraźny owal/gruszka
    'M-4,-10 L4,-10 L5.5,6 L3,10 L0,11 L-3,10 L-5.5,6 Z '
    // Wirnik główny — 2 łopaty (±10, nie ±17)
  + 'M-10,-2 L10,-2 L10,-0.5 L-10,-0.5 Z '
  + 'M-7.5,-6 L7.5,2 L7.5,3.5 L-7.5,-4.5 Z '
    // Belka ogonowa
  + 'M-1.5,9 L1.5,9 L2,17 L-2,17 Z '
    // Wirnik ogonowy
  + 'M2,14 L5.5,14 L5.5,17 L2,17 Z',

  // Dwuwirnikowy tandem — CH-47 Chinook
  // Ciało: długi prostokąt. Wirniki: ±9
  tandem:
    // Kadłub — wysoki i wyraźny
    'M-5,-14 L5,-14 L6,13 L4,16 L-4,16 L-6,13 Z '
    // Przedni wirnik (±9)
  + 'M-9,-11 L9,-11 L9,-9.5 L-9,-9.5 Z '
  + 'M-6.5,-15 L6.5,-7 L6.5,-5.5 L-6.5,-13.5 Z '
    // Tylny wirnik (±9)
  + 'M-9,9 L9,9 L9,10.5 L-9,10.5 Z '
  + 'M-6.5,5 L6.5,13 L6.5,14.5 L-6.5,6.5 Z',

  // ── Drony / UAV ───────────────────────────────────────────────────────────

  // MQ-9 Reaper / Global Hawk — długie skrzydła, mały kadłub
  // Charakterystyczny: skrzydła dużo dłuższe niż kadłub
  uav: 'M0,-11 L1.5,-5 '
     + 'L18,0 L18,2 '              // bardzo długie prawe skrzydło
     + 'L1.5,1 L1.5,9 L0,8 L-1.5,9 '
     + 'L-1.5,1 L-18,2 L-18,0 L-1.5,-5 Z',

  // Mały dron bojowy / rekonesansowy — kształt X
  drone: 'M0,-15 L2.5,-3 L12,2 L2.5,0 L2.5,15 L0,12 L-2.5,15 L-2.5,0 L-12,2 L-2.5,-3 Z',

  // ── Lżejsze od powietrza ──────────────────────────────────────────────────

  // Sterowiec / balon
  airship: 'M0,-17 C8,-17 14,-8 14,0 C14,10 7,17 0,17 C-7,17 -14,10 -14,0 C-14,-8 -8,-17 0,-17 Z '
         + 'M-3,17 L-3,20 L3,20 L3,17 Z',
}

// ── Mapowanie kodu ICAO → kształt ────────────────────────────────────────────

export function getShapeKey(t) {
  const type = (t || '').toUpperCase().replace(/[-\s]/g, '')

  // Sterowce / balony
  if (/BLIMP|ZEPPELIN|AIRSHIP|BALLOON/.test(type)) return 'airship'

  // Drony / UAV
  if (/MQ9|MQ1B|MQ1C|RQ4|RQ7|RQ170|REAPER|PREDATOR|GLOBALHAWK|TRITON|HERON|HERMES|WATCHKEEPER/.test(type)) return 'uav'
  if (/QUAD|DJI|UAV|UAS/.test(type)) return 'drone'

  // Śmigłowce tandem
  if (/CH47|CH146|MH47|CHINOOK/.test(type)) return 'tandem'

  // Śmigłowce jednowirnikowe
  if (/^UH|^AH|^MH|^HH|^SH|EC135|EC145|EC665|AS332|AS365|W3|W3A|MI8|MI17|MI24|MI28|KA50|KA52|LYNX|PUMA|MERLIN|SEAHAWK|BLACKHAWK|APACHE|WILDCAT|COUGAR|DAUPHIN|TIGER/.test(type)) return 'helicopter'

  // Skrzydło latające
  if (/^B2|SPIRIT|B2A/.test(type)) return 'flyingwing'

  // Myśliwce delta (F-22, Eurofighter, Rafale)
  if (/F22|F117|EF2000|TYPHOON|RAFALE|JAS39|GRIPEN|MIRAGE/.test(type)) return 'delta'

  // Myśliwce skośne (F-16, F-15, FA-18, Su, MiG)
  if (/F16|F15|FA18|F18|A10|MIG21|MIG29|MIG31|SU27|SU30|SU35|SU57|HORNET|VIPER|FLANKER|FULCRUM|HAWKT/.test(type)) return 'fighter'

  // Tankowce
  if (/KC135|KC46|KC10|MRTT|A330MRT|VCATA/.test(type)) return 'tanker'

  // Transport strategiczny (C-17, IL-76, An-124)
  if (/C17|AN124|AN225|IL76|IL78/.test(type)) return 'strategic'

  // Transport 4-śmigłowy (C-130, E-3, An-12)
  if (/C130|C160|AN12|E3|E8/.test(type)) return 'transport4'

  // Transport 2-śmigłowy (CASA, An-26, C-212)
  if (/C295|CASA|AN26|AN32|C212|C235/.test(type)) return 'transport'

  // Patrolowe i ISR
  if (/P8|P3|ORION|POSEIDON|SENTINEL|RC135|EP3|JSTARS/.test(type)) return 'patrol'

  // Turbośmigłowe twin
  if (/^BE|C12|KINGAIR|PC12|DHC8|DASH8/.test(type)) return 'twin'

  // Turbośmigłowe single
  if (/ATR|PC6|DHC6|CARAVAN|C208|C295M/.test(type)) return 'turboprop'

  // Szerokokadłubowe 4-silnikowe
  if (/B744|B747|B748|A340|A380|IL96/.test(type)) return 'quad'

  // Szerokokadłubowe
  if (/B767|B777|B787|B762|B763|A330|A340|A350|A359|A388/.test(type)) return 'heavy'

  return 'jet'
}

// ── Kolor wg wysokości ───────────────────────────────────────────────────────

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

export const ftToM   = ft => ft != null ? Math.round(ft  * 0.3048) : null
export const knToKmh = kn => kn != null ? Math.round(kn  * 1.852)  : null
