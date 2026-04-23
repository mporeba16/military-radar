import './StatusBar.css'

export default function StatusBar({ lastUpdate, isLoading, error, count }) {
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  return (
    <div className="status-bar">
      {error
        ? <span className="status-err">✗ {error}</span>
        : isLoading
          ? <span className="status-loading">◌ Pobieranie danych…</span>
          : <span className="status-ok">◉ {count} obiektów · {timeStr}</span>
      }
    </div>
  )
}
