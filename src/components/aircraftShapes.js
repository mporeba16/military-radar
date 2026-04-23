// Kształty ikon samolotów — centralnie w (0,0), nos skierowany w górę (track=0 = północ)
// Każdy kształt to SVG path d=""

export const SHAPES = {
  // Odrzutowiec wąskokadłubowy (domyślny)
  jet: 'M0,-14 L2,-5 L13,3 L13,5 L2,2 L2,9 L6,12 L6,13 L0,11 L-6,13 L-6,12 L-2,9 L-2,2 L-13,5 L-13,3 L-2,-5 Z',

  // Szerokokadłubowy (B747, B777, A380)
  heavy: 'M0,-14 L3,-2 L17,5 L17,8 L3,4 L3,11 L7,13 L7,15 L0,13 L-7,15 L-7,13 L-3,11 L-3,4 L-17,8 L-17,5 L-3,-2 Z',

  // Myśliwiec (delta/skrzydła do tyłu)
  fighter: 'M0,-14 L3,3 L14,12 L12,14 L0,8 L-12,14 L-14,12 L-3,3 Z M-1.5,7 L1.5,7 L2.5,13 L0,12 L-2.5,13 Z',

  // Wojskowy transport (C-130, C-17 — proste skrzydła, duży kadłub)
  transport: 'M0,-13 L2,0 L16,4 L16,6 L2,5 L2,11 L5,13 L5,14 L0,13 L-5,14 L-5,13 L-2,11 L-2,5 L-16,6 L-16,4 L-2,0 Z',

  // Turbośmigłowy (krótsze, proste skrzydła + śmigło)
  turboprop: 'M0,-11 L1.5,-3 L10,2 L10,4 L1.5,2 L1.5,9 L4,11 L4,12 L0,11 L-4,12 L-4,11 L-1.5,9 L-1.5,2 L-10,4 L-10,2 L-1.5,-3 Z M-5,-12 L5,-12 L5,-11 L-5,-11 Z',

  // Śmigłowiec (kadłub + wirniki jako wypełnione prostokąty)
  helicopter: 'M-3.5,-4 L3.5,-4 L4.5,5 L2,8 L0,9 L-2,8 L-4.5,5 Z M-15,-2 L15,-2 L15,-1 L-15,-1 Z M-10,-6 L10,-0 L10,1 L-10,-5 Z M2.5,6 L8,11 L7.5,12 L2,7 Z M7,10 L9,10 L9,11.5 L7,11.5 Z',

  // Dron / UAV (kształt X)
  drone: 'M0,-12 L2.5,-1 L12,3 L2.5,1 L2.5,12 L0,8 L-2.5,12 L-2.5,1 L-12,3 L-2.5,-1 Z M-1,0 L1,0 L1,1 L-1,1 Z',

  // Tankowiec (jak heavy ale z wysięgnikiem)
  tanker: 'M0,-14 L3,-2 L17,5 L17,8 L3,4 L4,12 L7,13 L7,15 L0,13 L-7,15 L-7,13 L-4,12 L-3,4 L-17,8 L-17,5 L-3,-2 Z M0,12 L1,17 L-1,17 Z',

  // Patrolowy morski (P-8 itp. — jak jet ale z gondolami pod skrzydłami)
  patrol: 'M0,-14 L2,-5 L13,3 L13,5 L2,2 L2,9 L6,12 L6,13 L0,11 L-6,13 L-6,12 L-2,9 L-2,2 L-13,5 L-13,3 L-2,-5 Z M8,4 L10,4 L10,6 L8,6 Z M-10,4 L-8,4 L-8,6 L-10,6 Z',
}

// Mapowanie typu ICAO/callsign → kształt
export function getShapeKey(t) {
  const type = (t || '').toUpperCase()

  if (/UH-|AH-|CH-|MH-|HH-|SH-|^EC\d|^AS\d|^W-3|^MI-|LYNX|PUMA|CHIN|TIGER|MERLIN|SEAHAWK|BLACKHAWK|WILDCAT|APACHE/.test(type))
    return 'helicopter'

  if (/F-16|F-15|F-22|F-35|FA-18|F\/A-18|MIG|SU-[234679]|TYPHO|RAFALE|JAS\s?39|GRIPEN|EF-2|EF2000|HAWK T/.test(type))
    return 'fighter'

  if (/C-130|C-17|C-5|A400|AN-\d|IL-\d|CASA|C-160|KC-130/.test(type))
    return 'transport'

  if (/KC-135|KC-10|A330MRT|MRTT|VCATA/.test(type))
    return 'tanker'

  if (/P-8|P-3|ORION|POSEIDON|E-3|AWACS|SENTINEL|RC-135|EP-3/.test(type))
    return 'patrol'

  if (/MQ-|RQ-|REAPER|PREDATOR|GLOBAL HAWK|TRITON|HERON|HERMES/.test(type))
    return 'drone'

  if (/ATR|DHC|^PC-|^C-26|^E-2C|KING AIR|CARAVAN|^BE-/.test(type))
    return 'turboprop'

  if (/B74|B747|B77|B777|B78|B787|A38|A380|A34|A340|A33|A330/.test(type))
    return 'heavy'

  return 'jet'
}

// Kolor na podstawie wysokości (gradient jak globe.adsbexchange.com)
export function altToColor(altFt) {
  if (altFt == null) return '#aaaaaa'

  const stops = [
    [    0, [255,  20,  20]],  // czerwony
    [ 2000, [255,  90,   0]],  // czerwono-pomarańczowy
    [ 5000, [255, 140,   0]],  // pomarańczowy
    [10000, [255, 215,   0]],  // żółty
    [15000, [160, 230,   0]],  // żółto-zielony
    [20000, [  0, 200,  20]],  // zielony
    [25000, [  0, 215, 180]],  // zielono-cyjanowy
    [30000, [  0, 200, 255]],  // cyjan
    [35000, [ 40, 130, 255]],  // niebieski
    [40000, [ 80,  60, 255]],  // niebiesko-fioletowy
    [50000, [180,   0, 255]],  // fioletowy
  ]

  const alt = Math.max(0, Math.min(altFt, 50000))

  for (let i = 0; i < stops.length - 1; i++) {
    const [a0, c0] = stops[i]
    const [a1, c1] = stops[i + 1]
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
