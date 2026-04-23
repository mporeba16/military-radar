import './StatusBar.css'

const SOURCE_LABELS = {
  opensky: 'OpenSky',
  adsbfi: 'adsb.fi',
  demo: 'DEMO',
}

export default function StatusBar({ lastUpdate, isLoading, error, count, source }) {
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  const sourceLabel = source ? SOURCE_LABELS[source] || source : null

  return (
    <div className="status-bar">
      {error
        ? <span className="status-err">✗ {error}</span>
        : isLoading
          ? <span className="status-loading">◌ Pobieranie danych…</span>
          : <span className="status-ok">
              ◉ {count} obiektów · {timeStr}
              {sourceLabel && (
                <span className={`status-source ${source === 'demo' ? 'demo' : ''}`}>
                  {sourceLabel}
                </span>
              )}
            </span>
      }
    </div>
  )
}
