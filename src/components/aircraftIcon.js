// Ikona maszyny jako SVG: sylwetka wg typu, wypełnienie wg wysokości,
// obwódka kategorii albo alarmowego squawka, zaznaczenie. Bez Leafletu
// i Reacta — da się ją wyrenderować i zmierzyć poza mapą.
import { SHAPES, getShapeKey, altToColor, ftToM } from './aircraftShapes'
import { KIND_COLORS } from '../lib/palette'

// Minimum tap target diameter (px) — Apple HIG / Material guideline
export const MIN_TAP_TARGET = 44

// Specjalne kody transpondera = „coś jest nie tak" — sygnalizujemy je
// wykrzyknikiem przy ikonie, żeby było widać bez klikania w kartę.
//   7500 porwanie, 7700 emergency  → czerwony
//   7600 brak łączności, 7400 utrata UAV → bursztynowy
const SQUAWK_ALERT_COLOR = { '7500': '#ff1e1e', '7700': '#ff1e1e', '7600': '#ffae00', '7400': '#ffae00' }
export function squawkAlertColor(squawk) {
  if (squawk == null) return null
  return SQUAWK_ALERT_COLOR[String(squawk).padStart(4, '0')] || null
}

export function buildIconSvg(ac, isSelected, zoomScale) {
  const onGround = !!ac.on_ground
  const hasTrack = ac.track != null
  const heading = hasTrack ? ac.track : 0
  const altM = ftToM(ac.alt_baro)
  const color = isSelected
    ? '#ffffff'
    : onGround
      ? '#808080'
      : altToColor(altM)
  const shapeKey = getShapeKey(ac.t, ac.gs, ac.category)
  const shape = SHAPES[shapeKey] || SHAPES.jet_swept

  const { cx, cy, scale, sz = 44 } = shape
  const effectiveSz = Math.round(sz * zoomScale)
  const half = effectiveSz / 2
  const paths = Array.isArray(shape.path) ? shape.path : [shape.path]
  const tx = `scale(${scale * zoomScale}) translate(${-cx} ${-cy})`

  // Kategorie poza wojskiem (śmigłowce służbowe, duże samoloty) niosą swój
  // kolor OBWÓDKĄ sylwetki, nie kółkiem wokół niej (decyzja użytkownika):
  // kółko zasłaniało ikonę i przy gęstym ruchu zlewało się z zaznaczeniem.
  // Wypełnienie dalej koduje wysokość, więc jedno spojrzenie daje i kategorię,
  // i pułap.
  const KIND_OUTLINE = { heli: KIND_COLORS.heli, heavy: KIND_COLORS.heavy }
  // Alarmowy squawk bierze obwódkę dla siebie — sam wykrzyknik w rogu ikony
  // ginął w gęstym ruchu, a to jedyna rzecz na mapie, której nie wolno
  // przeoczyć. Ma pierwszeństwo przed kolorem kategorii: maszyna w kłopocie
  // jest ważniejsza niż to, czy jest służbowa, czy duża.
  const alertColor = squawkAlertColor(ac.squawk)
  const outline = alertColor || KIND_OUTLINE[ac.kind]
  const strokeW = (alertColor ? 2.3 : outline ? 1.6 : 0.7) / (scale * zoomScale)
  // Ciemny kontur pod spodem zostaje także przy kolorowej obwódce — bez niego
  // cyjan albo bursztyn ginie na jasnym podkładzie (satelita, płótno Esri).
  const outlinePaths = outline
    ? paths.map(d =>
      `<path d="${d}" fill="none" stroke="rgba(0,0,0,0.65)" stroke-width="${strokeW * 2.1}" stroke-linejoin="round"/>`
    ).join('')
    : ''
  const mainPaths = paths.map(d =>
    `<path d="${d}" fill="${color}" stroke="${outline || 'rgba(0,0,0,0.55)'}" stroke-width="${strokeW}" stroke-linejoin="round"/>`
  ).join('')
  const shadowPaths = paths.map(d => `<path d="${d}" fill="rgba(0,0,0,0.4)"/>`).join('')
  const ringR = Math.min(16 * zoomScale, half - 2)
  // Zaznaczenie: ciemne tło (czytelne na jasnej mapie/satelicie) + jaskrawy
  // zielony pierścień + rozszerzający się, zanikający puls — od razu widać,
  // którą maszynę kliknięto, nawet w gęstym ruchu.
  const selPulseR = ringR + 11
  const selectionRing = isSelected
    ? `<circle r="${ringR}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="4.5"/>
       <circle r="${ringR}" fill="none" stroke="#00ff88" stroke-width="2.5"/>
       <circle r="${ringR}" fill="none" stroke="#00ff88" stroke-width="2" opacity="0.7">
         <animate attributeName="r" from="${ringR}" to="${selPulseR}" dur="1.4s" repeatCount="indefinite"/>
         <animate attributeName="opacity" from="0.7" to="0" dur="1.4s" repeatCount="indefinite"/>
       </circle>`
    : ''
  // S3: clamp tap padding so total target is always >= MIN_TAP_TARGET
  const tapPad = Math.max(6, Math.ceil((MIN_TAP_TARGET - effectiveSz) / 2))
  const hitR = half + tapPad
  const hitArea = `<circle r="${hitR}" fill="rgba(0,0,0,0)"/>`

  // V1: subtle desaturation when track is unknown (icon faces north by default)
  const groupOpacity = hasTrack ? 1 : 0.55

  // Wykrzyknik dla maszyn z alarmowym squawkiem (7500/7600/7700/7400) — w prawym
  // górnym rogu ikony, NIE obraca się z dziobem (to oznaczenie UI, nie część maszyny).
  // Zostaje obok obwódki, bo mówi CO się dzieje, a nie tylko że coś się dzieje.
  const badgeR = Math.max(5.5, 6.5 * zoomScale)
  const alertBadge = alertColor
    ? `<g transform="translate(${ringR},${-ringR})">
         <circle r="${badgeR}" fill="${alertColor}" stroke="#ffffff" stroke-width="1.3"/>
         <text x="0" y="0" font-size="${badgeR * 1.5}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif">!</text>
       </g>`
    : ''

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${effectiveSz + tapPad * 2}" height="${effectiveSz + tapPad * 2}" viewBox="-${hitR} -${hitR} ${hitR * 2} ${hitR * 2}" overflow="visible">
      ${hitArea}
      <g opacity="${groupOpacity}">
        <g transform="translate(1.2,1.2)">
          <g transform="rotate(${heading})"><g transform="${tx}">${shadowPaths}</g></g>
        </g>
        <g transform="rotate(${heading})">
          <g transform="${tx}">${outlinePaths}${mainPaths}</g>
        </g>
      </g>
      ${selectionRing}
      ${alertBadge}
    </svg>`
}
