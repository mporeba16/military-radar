import { useMemo } from 'react'
import { Marker, Polygon, Popup } from 'react-leaflet'
import L from 'leaflet'
import { AIRSPACE } from '../lib/palette'
import { MIL_BASES_PL } from '../airfields'
import {
  activeReservation, describeRemarks, formatAltRange, groupKey, shortName,
  unitLabel, TYPE_LABELS,
} from '../lib/airspace'
import { AREA_LABEL_ZOOM } from './MilRangesLayer'
import { t } from '../i18n'

const AIRFIELD_NAMES = Object.fromEntries(MIL_BASES_PL.map(b => [b.icao, b.name]))


const timeFmt = new Intl.DateTimeFormat('pl-PL', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw',
})

function formatSpan(r) {
  return `${timeFmt.format(r.s)}–${timeFmt.format(r.e)}`
}

function whoLabel(r) {
  return [unitLabel(r.unit, AIRFIELD_NAMES), ...describeRemarks(r.rem)].join(' · ')
}

// Strefy aktywne w chwili `now`. Obrysy są nieinteraktywne jak poligony —
// kliknięcie w mapę ma odznaczać maszynę, a strefy TSA potrafią przykryć pół
// województwa. Szczegóły są pod podpisem grupy (od AREA_LABEL_ZOOM).
// Serwer oddaje tylko rezerwacje na konkretne godziny, bez dronów — na mapie
// jest więc wyłącznie to, gdzie teraz coś zaplanowano.
export default function AirspaceLayer({ zones, now, zoom }) {
  const active = useMemo(() => (zones || [])
    .map(z => ({ ...z, cur: activeReservation(z.res, now) }))
    .filter(z => z.cur), [zones, now])

  const groups = useMemo(() => {
    // Trasy MRT to łańcuch kilkunastu odcinków z jedną rezerwacją — każdy
    // z własnym podpisem „MRT… · F-16” tworzył na mapie drabinę napisów.
    // Scalamy je po rezerwacji; resztę po sektorach (EPTS7A…E → TS7).
    const m = new Map()
    for (const z of active) {
      const key = z.type === 'MRT'
        ? `MRT|${z.cur.unit}|${z.cur.rem}|${z.cur.s}`
        : groupKey(z.id)
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(z)
    }
    return [...m.entries()].map(([key, members]) => ({
      key,
      name: members[0].type === 'MRT' ? 'MRT' : shortName(key),
      members: members.sort((a, b) => a.id.localeCompare(b.id)),
      center: meanCenter(members),
    }))
  }, [active])

  return (
    <>
      {active.flatMap(z => z.rings.map((ring, i) => (
        <Polygon
          key={`${z.id}-${i}`}
          positions={ring}
          interactive={false}
          pathOptions={{
            color: AIRSPACE,
            weight: 1.8,
            opacity: 0.9,
            dashArray: '6 4',
            fillColor: AIRSPACE,
            fillOpacity: 0.08,
          }}
        />
      )))}

      {zoom >= AREA_LABEL_ZOOM && groups.map(g => {
        const first = g.members[0].cur
        const who = describeRemarks(first.rem)[0]
        const text = who ? `${g.name} · ${who}` : g.name
        return (
          <Marker
            key={g.key}
            position={g.center}
            keyboard={false}
            zIndexOffset={-800}
            icon={L.divIcon({
              className: 'airspace-marker',
              html: `<span class="airspace-marker-label">${escapeHtml(text)}</span>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })}
          >
            <Popup className="airspace-popup" closeButton={false} autoPanPadding={[16, 16]}>
              <ZoneGroupPopup group={g} now={now} />
            </Popup>
          </Marker>
        )
      })}
    </>
  )
}

function ZoneGroupPopup({ group, now }) {
  // Sektory grupy mają zwykle tę samą rezerwację — wtedy jeden wiersz na całą
  // grupę; różne pułapy pokazujemy osobno.
  const rows = []
  for (const z of group.members) {
    const line = `${formatSpan(z.cur)}|${z.cur.lo}|${z.cur.hi}|${whoLabel(z.cur)}`
    const same = rows.find(r => r.line === line)
    if (same) same.ids.push(z.id)
    else rows.push({ line, ids: [z.id], r: z.cur })
  }
  const later = []
  for (const z of group.members) {
    for (const r of z.res) {
      if (r.s <= now) continue
      if (!later.some(x => x.s === r.s && x.e === r.e && whoLabel(x) === whoLabel(r))) later.push(r)
    }
  }
  later.sort((a, b) => a.s - b.s)
  later.splice(3)
  const type = TYPE_LABELS[group.members[0].type] || group.members[0].type

  return (
    <div className="airspace-pop">
      <div className="airspace-pop__title">{group.name}</div>
      <div className="airspace-pop__type">{type}</div>
      {rows.map(row => (
        <div className="airspace-pop__row" key={row.line}>
          <div className="airspace-pop__who">{whoLabel(row.r)}</div>
          <div className="airspace-pop__meta">
            {formatSpan(row.r)} · {formatAltRange(row.r.lo, row.r.hi)}
            {group.members.length > 1 && <> · {row.ids.map(shortName).join(', ')}</>}
          </div>
        </div>
      ))}
      {later.length > 0 && (
        <div className="airspace-pop__later">
          {t('AIRSPACE_NEXT')} {later.map(r => `${formatSpan(r)} (${whoLabel(r)})`).join('; ')}
        </div>
      )}
      <div className="airspace-pop__source">{t('AIRSPACE_SOURCE')}</div>
    </div>
  )
}

function meanCenter(members) {
  let lat = 0, lon = 0, n = 0
  for (const z of members) {
    for (const ring of z.rings) {
      for (const [a, b] of ring) { lat += a; lon += b; n++ }
    }
  }
  return n ? [lat / n, lon / n] : [0, 0]
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}
