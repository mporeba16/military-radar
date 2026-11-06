import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { plForm } from '../lib/plural'

// Licznik użytkowników (netlify/functions/usage.js) w panelu Statystyki:
// trzy liczby na wierzchu i słupki z ostatnich 14 dni, każdy podzielony na
// platformy. Tylko zbiorcze liczby.

// Kolory platform — sprawdzone walidatorem palety na tle panelu (#0d1a2e):
// rozróżnialne także przy daltonizmie, kontrast ≥ 3:1. Odcinki dzieli 2 px
// przerwy, a legenda podaje liczby, więc platforma nie zależy od samego koloru.
// Kolejność stała — odcinki zawsze w tym samym porządku od dołu.
const PLATFORMS = [
  { key: 'ios', label: 'iOS', color: '#3987e5' },
  { key: 'android', label: 'Android', color: '#d95926' },
  { key: 'desktop', label: 'Komputer', color: '#199e70' },
  { key: 'other', label: 'Inne', color: '#7d8590' },
]

const dayLabel = d => `${Number(d.slice(8))}.${Number(d.slice(5, 7))}`
const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', timeZone: 'UTC' })
// Godzina pierwszego otwarcia aplikacji tego dnia, czas polski.
const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
const dayLong = d => `${weekday.format(new Date(`${d}T12:00:00Z`))} ${dayLabel(d)}`
const describe = d => `${dayLabel(d.day)}: ${d.n}` + (d.n
  ? ` — ${PLATFORMS.filter(p => d.platform?.[p.key]).map(p => `${p.label} ${d.platform[p.key]}`).join(', ')}`
  : '')

function Kpi({ label, value }) {
  return (
    <div className="stat-kpi">
      <span className="stat-kpi__value">{value}</span>
      <span className="stat-kpi__label">{label}</span>
    </div>
  )
}

function DailyBars({ daily }) {
  // Od najstarszego do dziś, od lewej do prawej.
  const days = [...daily].reverse()
  const last = days.length - 1
  const max = Math.max(1, ...days.map(d => d.n))
  const [picked, setPicked] = useState(last)
  const p = days[picked]
  // Legenda: „Inne" tylko, gdy w ogóle się zdarzyły.
  const shown = PLATFORMS.filter(pl => pl.key !== 'other' || days.some(d => d.platform?.other))
  // Podpisy osi co kilka dni — przy 14 słupkach na telefonie wszystkie by się zlały.
  const ticks = new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last])
  return (
    <figure className="stat-chart">
      <figcaption className="stat-chart__head">
        <span className="stat-chart__title">{t('USAGE_DAILY')}</span>
        <span className="stat-chart__legend">
          {shown.map(pl => (
            <span key={pl.key} className="stat-chart__legend-item">
              <span className="stat-chart__swatch" style={{ background: pl.color }} />{pl.label}
            </span>
          ))}
        </span>
      </figcaption>

      <div className="stat-chart__area">
        {/* Linia maksimum — skala bez osi Y. */}
        <span className="stat-chart__grid" aria-hidden="true"><span>{max}</span></span>
        <div className="stat-chart__plot" role="img" aria-label={days.map(describe).join('; ')}>
          {days.map((d, i) => (
            // Dotknięcie słupka pokazuje jego dzień pod wykresem — na telefonie
            // nie ma najechania kursorem.
            <button key={d.day} type="button" title={describe(d)} onClick={() => setPicked(i)}
              className={`stat-chart__col${i === picked ? ' stat-chart__col--picked' : ''}`}>
              {/* Każdy odcinek ma wysokość liczoną od maksimum, nie od swojego
                  słupka — jedno urządzenie jest tak samo wysokie w każdym dniu.
                  Wcześniej przerwy między odcinkami zabierały wysokość
                  (column-reverse: pierwszy odcinek, iOS, na dole). */}
              {d.n
                ? PLATFORMS.filter(pl => d.platform?.[pl.key]).map(pl => (
                    <span key={pl.key} className="stat-chart__seg"
                      style={{ height: `${(d.platform[pl.key] / max) * 100}%`, backgroundColor: pl.color }} />
                  ))
                : <span className="stat-chart__zero" />}
            </button>
          ))}
        </div>
      </div>
      <div className="stat-chart__axis" aria-hidden="true">
        {days.map((d, i) => (
          <span key={d.day}>{ticks.has(i) ? (i === last ? t('USAGE_TODAY') : dayLabel(d.day)) : ''}</span>
        ))}
      </div>

      <div className="stat-chart__picked" aria-live="polite">
        <div className="stat-chart__picked-head">
          <span className="stat-chart__picked-day">{picked === last ? t('USAGE_TODAY') : dayLong(p.day)}</span>
          <span className="stat-chart__picked-n">{p.n} {plForm(p.n, 'urządzenie', 'urządzenia', 'urządzeń')}</span>
        </div>
        {p.devices?.length > 0 && (
          <ul className="stat-devices">
            {p.devices.map((dev, i) => {
              const pl = PLATFORMS.find(x => x.key === dev.platform) || PLATFORMS[3]
              return (
                <li key={i} className="stat-devices__row">
                  <span className="stat-chart__swatch" style={{ background: pl.color }} />
                  <span className="stat-devices__platform">{pl.label}</span>
                  <span className="stat-devices__place">
                    {/* Miasto, a gdy baza położeń go nie zna (częste u operatorów
                        komórkowych) — województwo. */}
                    {[dev.city || dev.region, dev.country].filter(Boolean).join(', ') || t('USAGE_NO_PLACE')}
                  </span>
                  {dev.at && <span className="stat-devices__time">{timeFmt.format(dev.at)}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </figure>
  )
}

export default function UsageStats() {
  const [stats, setStats] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/.netlify/functions/usage', { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`http-${r.status}`))))
      .then(setStats)
      .catch(err => { if (err.name !== 'AbortError') setFailed(true) })
    return () => ctrl.abort()
  }, [])

  return (
    <section className="cp-section">
      <div className="cp-label">{t('USAGE_LABEL')}</div>
      {failed && <p className="err small">{t('USAGE_ERROR')}</p>}
      {!stats && !failed && <p className="info-text small">{t('DIAG_FETCHING')}</p>}
      {stats && (
        <div className="stat-card">
          <div className="stat-kpis">
            <Kpi label={t('USAGE_TODAY')} value={stats.dau} />
            <Kpi label="7 dni" value={stats.wau} />
            <Kpi label="30 dni" value={stats.mau} />
          </div>
          <DailyBars daily={stats.daily} />
        </div>
      )}
    </section>
  )
}
