import { Polygon } from 'react-leaflet'
import { EAST_VOIVODESHIPS } from '../data/voivodeships'
import { threatStyle, THREAT_FILL_OPACITY } from '../lib/threatLevels'

// Nakładka ryzyka: wschodnie województwa pokolorowane poziomem policzonym
// przez funkcję `threat`. Wielokąty są NIEINTERAKTYWNE (interactive: false) —
// mapa reaguje na kliknięcie odznaczeniem samolotu i nakładka nie ma prawa
// tego przechwytywać. Szczegóły (co dokładnie podniosło poziom) pokazuje
// plakietka nad mapą, nie dymek na wielokącie.
export default function ThreatLayer({ regions }) {
  if (!regions?.length) return null
  const byId = new Map(regions.map(r => [r.id, r]))

  return (
    <>
      {EAST_VOIVODESHIPS.map(v => {
        const region = byId.get(v.id)
        if (!region) return null
        const { color } = threatStyle(region.level)
        const isCalm = region.level === 'calm'
        return (
          <Polygon
            key={v.id}
            positions={v.ring}
            interactive={false}
            pathOptions={{
              color,
              weight: isCalm ? 1 : 1.6,
              opacity: isCalm ? 0.5 : 0.85,
              dashArray: isCalm ? '4 6' : undefined,
              fillColor: color,
              fillOpacity: THREAT_FILL_OPACITY[region.level] ?? 0.04,
            }}
          />
        )
      })}
    </>
  )
}
