// Kształty ikon — centrum (0,0), nos skierowany w górę (track=0 = północ)
// viewBox: "-20 -20 40 40" → ikona 40x40px
// Proporcje: skrzydła ~60% długości kadłuba dla czytelności

export const SHAPES = {
  // Odrzutowiec wąskokadłubowy — skrzydła skośne, smukły kadłub
  jet: [
    'M0,-15',          // nos
    'L1.5,-7',         // kadłub do nasady skrzydła
    'L10,1 L10,3',     // prawe skrzydło: krawędź natarcia, spływu
    'L1.5,0',          // powrót do kadłuba za skrzydłem
    'L2,9 L5,12 L5,13',// prawy usterzenie poziome
    'L0,11',           // ogon
    'L-5,13 L-5,12 L-2,9', // lewe usterzenie
    'L-1.5,0',
    'L-10,3 L-10,1 L-1.5,-7 Z', // lewe skrzydło
  ].join(' '),

  // Szerokokadłubowy (B747, A380, C-5)
  heavy: [
    'M0,-15',
    'L2,-5',
    'L13,4 L13,7',
    'L2,3',
    'L2,10 L6,13 L6,14',
    'L0,13',
    'L-6,14 L-6,13 L-2,10',
    'L-2,3',
    'L-13,7 L-13,4 L-2,-5 Z',
  ].join(' '),

  // Myśliwiec — skrzydła delta, brak wyraźnego usterzenia poziomego
  fighter: [
    'M0,-16',          // ostry nos
    'L2.5,0',          // prawa krawędź kadłuba
    'L11,12',          // prawe skrzydło — krawędź spływu
    'L9,14',           // prawy wierzchołek skrzydła
    'L0,9',            // środek tyłu
    'L-9,14',
    'L-11,12',
    'L-2.5,0 Z',       // lewe skrzydło
    // Mały statecznik pionowy
    'M0,9 L1.5,14 L0,13 L-1.5,14 Z',
  ].join(' '),

  // Wojskowy transport — proste, wysoko osadzone skrzydła (C-130, C-17)
  transport: [
    'M0,-14',
    'L1.5,-2',         // kadłub — szerszy niż jet
    'L13,2 L13,4',     // proste skrzydło (nie skośne)
    'L1.5,3',
    'L1.5,10 L4,12 L4,14',
    'L0,13',
    'L-4,14 L-4,12 L-1.5,10',
    'L-1.5,3',
    'L-13,4 L-13,2 L-1.5,-2 Z',
  ].join(' '),

  // Tankowiec — jak heavy ale z małym wysięgnikiem z tyłu
  tanker: [
    'M0,-15',
    'L2,-4',
    'L14,5 L14,8',
    'L2,4',
    'L3,11 L6,13 L6,14',
    'L0,12',
    'L-6,14 L-6,13 L-3,11',
    'L-2,4',
    'L-14,8 L-14,5 L-2,-4 Z',
    // Wysięgnik do tankowania
    'M0,12 L1,18 L-1,18 Z',
  ].join(' '),

  // Patrolowy morski — jak jet z gondolami silników pod skrzydłami
  patrol: [
    'M0,-15',
    'L1.5,-7',
    'L10,1 L10,3',
    'L1.5,0',
    'L2,9 L5,11 L5,13',
    'L0,12',
    'L-5,13 L-5,11 L-2,9',
    'L-1.5,0',
    'L-10,3 L-10,1 L-1.5,-7 Z',
    // Gondole silników
    'M7,0 L9,0 L9,3 L7,3 Z',
    'M-9,0 L-7,0 L-7,3 L-9,3 Z',
  ].join(' '),

  // Turbośmigłowy — proste skrzydła + śmigło na nosie
  turboprop: [
    'M0,-12',
    'L1.5,-5',
    'L9,1 L9,3',
    'L1.5,1',
    'L1.5,8 L3.5,10 L3.5,12',
    'L0,11',
    'L-3.5,12 L-3.5,10 L-1.5,8',
    'L-1.5,1',
    'L-9,3 L-9,1 L-1.5,-5 Z',
    // Śmigło
    'M-5,-13 L5,-13 L5,-12 L-5,-12 Z',
  ].join(' '),

  // Śmigłowiec — owalny kadłub + wirnik główny + belka ogonowa
  helicopter: [
    // Kadłub
    'M-3.5,-6 L3.5,-6 L4.5,5 L2,9 L0,10 L-2,9 L-4.5,5 Z',
    // Wirnik główny — dwa ramiona jako cienkie wypełnione prostokąty
    'M-15,-3 L15,-3 L15,-1.5 L-15,-1.5 Z',
    'M-11,-7 L11,-0.5 L11,0.5 L-11,-6 Z',
    // Belka ogonowa i wirnik boczny
    'M2,7 L3,13 L-0,12 Z',
    'M2.5,12 L5,12 L5,14 L2.5,14 Z',
  ].join(' '),

  // Dron / UAV — kształt X z centralnym punktem
  drone: [
    'M0,-14 L2,-3 L10,2 L3,2 L3,13 L0,10 L-3,13 L-3,2 L-10,2 L-2,-3 Z',
  ].join(' '),
}

// Mapowanie typu → kształt
export function getShapeKey(t) {
  const type = (t || '').toUpperCase()

  if (/UH-|AH-|CH-|MH-|HH-|SH-|^EC\d|^AS\d|^W-3|^MI-|LYNX|PUMA|CHIN|TIGER|MERLIN|SEAHAWK|BLACKHAWK|WILDCAT|APACHE/.test(type))
    return 'helicopter'

  if (/F-16|F-15|F-22|F-35|FA-18|F\/A-18|MIG|SU-[234679]|TYPHO|RAFALE|JAS\s?39|GRIPEN|EF-2|EF2000/.test(type))
    return 'fighter'

  if (/C-130|C-17|C-5|A400|AN-\d|IL-\d|CASA|C-160|KC-130/.test(type))
    return 'transport'

  if (/KC-135|KC-10|A330MRT|MRTT/.test(type))
    return 'tanker'

  if (/P-8|P-3|ORION|POSEIDON|E-3|AWACS|SENTINEL|RC-135|EP-3/.test(type))
    return 'patrol'

  if (/MQ-|RQ-|REAPER|PREDATOR|GLOBAL\s?HAWK|TRITON|HERON/.test(type))
    return 'drone'

  if (/ATR|DHC|^PC-|KING\s?AIR|CARAVAN|^BE-|C-295|^C-2\b/.test(type))
    return 'turboprop'

  if (/B74[0-9]|B747|B77[0-9]|B777|B78[0-9]|B787|A38[0-9]|A380|A34[0-9]|A340|A33[0-9]|A330|C-5/.test(type))
    return 'heavy'

  return 'jet'
}

// Gradient koloru wg wysokości — identyczny z globe.adsbexchange.com
export function altToColor(altM) {
  if (altM == null) return '#aaaaaa'

  // Progi w metrach (konwertowane z ft: 0/2k/5k/10k/15k/20k/25k/30k/35k/40k/50k ft)
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
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * t)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * t)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * t)
      return `rgb(${r},${g},${b})`
    }
  }
  return 'rgb(180,0,255)'
}

// Konwersje jednostek
export const ftToM = ft => ft != null ? Math.round(ft * 0.3048) : null
export const knToKmh = kn => kn != null ? Math.round(kn * 1.852) : null
