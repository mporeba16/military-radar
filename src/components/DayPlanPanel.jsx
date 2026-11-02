import { useMemo, useState } from 'react'
import { MIL_BASES_PL } from '../airfields'
import { formatAltRange } from '../lib/airspace'
import { blockStatus, blocksForDay, buildBlocks, orderForList, startsIn } from '../lib/dayPlan'

// Panel „Plan dnia": kto, kiedy, jak wysoko i gdzie ma dziś zaplanowane loty
// — z rezerwacji stref w planie PAŻP. Kliknięcie bloku pokazuje strefy na mapie.

const AIRFIELD_NAMES = Object.fromEntries(MIL_BASES_PL.map(b => [b.icao, b.name]))

const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
const dateFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Warsaw' })

function BlockRow({ b, now, onFocus, selected }) {
  const status = blockStatus(b, now)
  return (
    <li>
      <button className={`plan-row plan-row--${status} plan-row--${b.category}${selected ? ' plan-row--selected' : ''}`}
        aria-pressed={selected} onClick={() => onFocus(b)}>
        <span className="plan-row__time">
          <span className="plan-row__windows">
            {b.windows.map((w, i) => (
              <span key={w.s} className={w.e <= now ? 'plan-row__win--past' : undefined}>
                {i > 0 && ', '}{timeFmt.format(w.s)}–{timeFmt.format(w.e)}
              </span>
            ))}
          </span>
          {status === 'active' && <span className="plan-row__badge plan-row__badge--live">trwa</span>}
          {status === 'upcoming' && <span className="plan-row__badge">{startsIn(b, now)}</span>}
        </span>
        <span className="plan-row__what">{b.type}</span>
        <span className="plan-row__meta">
          {formatAltRange(b.lo, b.hi)} · {b.zonesText}
        </span>
      </button>
    </li>
  )
}

export default function DayPlanPanel({ zones, error, now, notams, onFocus, focusKey }) {
  // Tylko dziś: PAŻP udostępnia jeden dzień planu (06:00–06:00 UTC), a planu
  // na jutro nie da się pobrać nawet wieczorem (sprawdzone 02.11.2026 o 21:52)
  // — zakładka „Jutro" była przez to zawsze wyszarzona.
  const blocks = useMemo(() => buildBlocks(zones), [zones])
  const dayBlocks = useMemo(() => blocksForDay(blocks, 'today', now), [blocks, now])
  // Bez filtrów (decyzja użytkownika); same szkolne bloki (M-346, Orlik)
  // odpadają, jak szkoleniowe maszyny na radarze.
  const visible = orderForList(dayBlocks.filter(b => b.category !== 'training'), now)
  // Zakończone zwinięte na dół: wieczorem lista składała się z samych
  // przekreśleń i to, co jeszcze przed nami, ginęło między nimi.
  const past = visible.filter(b => blockStatus(b, now) === 'past')
  const ahead = visible.filter(b => blockStatus(b, now) !== 'past')
  const [pastOpen, setPastOpen] = useState(false)

  const milNotams = useMemo(() => {
    const out = []
    for (const [icao, list] of Object.entries(notams?.airports || {})) {
      for (const n of list) {
        if ((n.closed || n.mil) && n.to > now) out.push({ ...n, icao })
      }
    }
    return out.sort((a, b) => a.from - b.from)
  }, [notams, now])

  return (
    <div className="panel-body plan">
      <div className="plan-day">Dziś · {dateFmt.format(now)}</div>

      {zones == null && !error && <p className="plan-empty">Wczytywanie planu…</p>}
      {error && zones == null && <p className="plan-empty">Plan PAŻP chwilowo niedostępny.</p>}
      {zones != null && visible.length === 0 && (
        <p className="plan-empty">Brak zaplanowanych lotów z podanym typem maszyn.</p>
      )}

      {zones != null && past.length > 0 && ahead.length === 0 && (
        <p className="plan-empty">Na dziś nic więcej nie zaplanowano.</p>
      )}

      <ul className="plan-list">
        {ahead.map(b => (
          <BlockRow key={b.key} b={b} now={now} onFocus={onFocus} selected={b.key === focusKey} />
        ))}
      </ul>

      {past.length > 0 && (
        <>
          <button className="plan-past-toggle" aria-expanded={pastOpen} onClick={() => setPastOpen(o => !o)}>
            <span>Zakończone dziś ({past.length})</span>
            <span className="plan-past-toggle__chev" aria-hidden="true">{pastOpen ? '▴' : '▾'}</span>
          </button>
          {pastOpen && (
            <ul className="plan-list">
              {past.map(b => (
                <BlockRow key={b.key} b={b} now={now} onFocus={onFocus} selected={b.key === focusKey} />
              ))}
            </ul>
          )}
        </>
      )}

      {milNotams.length > 0 && (
        <section className="cp-section plan-notams">
          <div className="cp-label">NOTAM-y wojskowe</div>
          <ul className="plan-list">
            {milNotams.map(n => (
              <li key={`${n.icao}-${n.id}`} className={`plan-notam ${n.closed ? 'plan-notam--closed' : ''}`}>
                <span className="plan-row__time">
                  {AIRFIELD_NAMES[n.icao] || n.icao} · {n.closed ? 'lotnisko zamknięte' : 'aktywność wojskowa'}
                </span>
                <span className="plan-row__meta">{timeFmt.format(n.from)}–{timeFmt.format(n.to)} · {n.id}</span>
                <span className="plan-notam__text">{n.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="plan-source">
        Źródło: PAŻP (AUP/UUP)
      </p>
    </div>
  )
}
