// Treść dymka lotniska wojskowego: co dziś (i jutro rano) lata z tej bazy
// według planu PAŻP. Czysta funkcja — dane wchodzą, struktura do wyświetlenia
// wychodzi; HTML składa mapa.
//
// Ta sama logika co „Plan dnia" (dayPlan.js), zawężona do rezerwacji tej
// bazy: wiersz na typ maszyny z listą godzin, bez szkolnych i bez rezerwacji
// bez rozpoznanej maszyny. Typy z identycznymi godzinami (Mi-2 i SW-4
// z Dęblina) dzielą jeden wiersz. Wcześniej wiersz był na każdy zestaw uwag —
// Dęblin miał pięć nakładających się linijek, a Radom dwie identyczne.

import { buildBlocks, warsawDay } from './dayPlan'

const MAX_PLAN_ROWS = 6

export function basePlan(icao, zones, now) {
  const own = (zones || [])
    .map(z => ({ ...z, res: (z.res || []).filter(r => r.unit === icao && r.e > now) }))
    .filter(z => z.res.length)
  const tomorrow = warsawDay(now + 24 * 3600_000)

  const rows = new Map()
  for (const b of buildBlocks(own)) {
    const windows = b.windows.filter(w => w.e > now)
    if (!windows.length) continue
    const key = `${b.day}|${windows.map(w => `${w.s}-${w.e}`).join(',')}`
    let row = rows.get(key)
    if (!row) {
      row = { windows, s: windows[0].s, e: windows[windows.length - 1].e, types: [], zones: [], tomorrow: b.day === tomorrow }
      rows.set(key, row)
    }
    row.types.push(b.type)
    for (const id of b.zones) if (!row.zones.includes(id)) row.zones.push(id)
  }

  return [...rows.values()]
    .sort((a, b) => a.s - b.s)
    .slice(0, MAX_PLAN_ROWS)
    .map(r => ({ ...r, active: r.windows.some(w => w.s <= now && now < w.e) }))
}
