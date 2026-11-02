import { useEffect, useState } from 'react'
import { t } from '../i18n'

// Licznik użytkowników (netlify/functions/usage.js) w panelu Statystyki:
// trzy liczby na wierzchu, słupki dzień po dniu, udziały instalacji
// i powiadomień, podział na platformy. Tylko zbiorcze liczby.

// Kolory platform — sprawdzone walidatorem palety na tle panelu (#0d1a2e):
// rozróżnialne także przy daltonizmie, kontrast ≥ 3:1. Platforma ma przy
// tym zawsze podpis z liczbą, więc nie zależy od samego koloru.
const PLATFORMS = [
  { key: 'ios', label: 'iOS', color: '#3987e5' },
  { key: 'android', label: 'Android', color: '#d95926' },
  { key: 'desktop', label: 'Komputer', color: '#199e70' },
]

const dayLabel = d => `${Number(d.slice(8))}.${Number(d.slice(5, 7))}`
const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0)

function Tile({ label, value }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__value">{value}</span>
      <span className="stat-tile__label">{label}</span>
    </div>
  )
}

function Meter({ label, n, of }) {
  return (
    <div className="stat-meter">
      <div className="stat-meter__head">
        <span>{label}</span>
        <span className="stat-meter__num">{n} z {of} · {pct(n, of)}%</span>
      </div>
      <div className="stat-meter__track" role="img" aria-label={`${label}: ${n} z ${of}`}>
        <span className="stat-meter__fill" style={{ width: `${pct(n, of)}%` }} />
      </div>
    </div>
  )
}

function DailyBars({ daily }) {
  // Od najstarszego do dziś, od lewej do prawej.
  const days = [...daily].reverse()
  const max = Math.max(1, ...days.map(d => d.n))
  return (
    <figure className="stat-bars">
      <figcaption className="stat-bars__title">
        <span>{t('USAGE_DAILY')}</span>
        <span className="stat-bars__max">maks. {max}</span>
      </figcaption>
      <div className="stat-bars__plot" role="img"
        aria-label={days.map(d => `${dayLabel(d.day)}: ${d.n}`).join(', ')}>
        {days.map((d, i) => {
          const today = i === days.length - 1
          return (
            <span key={d.day} className="stat-bars__col" title={`${dayLabel(d.day)}: ${d.n}`}>
              {today && d.n > 0 && <span className="stat-bars__val">{d.n}</span>}
              <span className={`stat-bars__bar${today ? ' stat-bars__bar--today' : ''}${d.n ? '' : ' stat-bars__bar--zero'}`}
                style={{ height: d.n ? `${(d.n / max) * 100}%` : undefined }} />
            </span>
          )
        })}
      </div>
      <div className="stat-bars__axis">
        <span>{dayLabel(days[0].day)}</span>
        <span>{t('USAGE_TODAY')}</span>
      </div>
    </figure>
  )
}

function PlatformSplit({ platform, total }) {
  const parts = PLATFORMS.filter(p => platform[p.key] > 0)
  return (
    <div className="stat-split">
      <div className="stat-split__label">{t('USAGE_PLATFORMS')}</div>
      <div className="stat-split__bar" role="img"
        aria-label={PLATFORMS.map(p => `${p.label}: ${platform[p.key]}`).join(', ')}>
        {parts.map(p => (
          <span key={p.key} style={{ flexGrow: platform[p.key], background: p.color }} />
        ))}
      </div>
      <div className="stat-split__legend">
        {PLATFORMS.map(p => (
          <span key={p.key} className="stat-split__item">
            <span className="stat-split__swatch" style={{ background: p.color }} />
            {p.label} <strong>{platform[p.key]}</strong>
            <span className="stat-split__pct">{pct(platform[p.key], total)}%</span>
          </span>
        ))}
      </div>
    </div>
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
        <div className="stats">
          <div className="stat-tiles">
            <Tile label={t('USAGE_TODAY')} value={stats.dau} />
            <Tile label="7 dni" value={stats.wau} />
            <Tile label="30 dni" value={stats.mau} />
          </div>
          <DailyBars daily={stats.daily} />
          <div className="stats__sub">{t('USAGE_WEEK_NOTE')} ({stats.week.devices})</div>
          <Meter label={t('USAGE_INSTALLED')} n={stats.week.standalone} of={stats.week.devices} />
          <Meter label={t('USAGE_PUSH')} n={stats.week.push} of={stats.week.devices} />
          {stats.week.devices > 0 && <PlatformSplit platform={stats.week.platform} total={stats.week.devices} />}
          <p className="stats__note">{t('USAGE_NOTE')}</p>
        </div>
      )}
    </section>
  )
}
