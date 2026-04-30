import './ControlPanel.css'

export default function ControlPanel({
  mode, setMode, radius, setRadius,
  location, locationError, requestLocation,
  isSubscribed, isSubscribing, subscribe, permissionState,
  onRefresh
}) {
  return (
    <div className="control-panel">
      <section className="cp-section">
        <div className="cp-label">TRYB</div>
        <div className="btn-group">
          <button
            className={`btn-mode ${mode === 'gps' ? 'active' : ''}`}
            onClick={() => { setMode('gps'); if (!location) requestLocation() }}
          >
            GPS
          </button>
          <button
            className={`btn-mode ${mode === 'poland' ? 'active' : ''}`}
            onClick={() => setMode('poland')}
          >
            Polska
          </button>
          <button
            className={`btn-mode ${mode === 'europe' ? 'active' : ''}`}
            onClick={() => setMode('europe')}
          >
            Europa
          </button>
        </div>
        {mode === 'gps' && (
          <div className="gps-status">
            {location
              ? <span className="ok">◉ {location.lat.toFixed(3)}°N {location.lon.toFixed(3)}°E</span>
              : locationError
                ? <span className="err">✗ {locationError}</span>
                : <button className="link-btn" onClick={requestLocation}>Pobierz lokalizację</button>
            }
          </div>
        )}
      </section>

      {mode === 'gps' && (
        <section className="cp-section">
          <div className="cp-label">ZASIĘG: {radius} km</div>
          <input
            type="range"
            min="25"
            max="500"
            step="25"
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
            className="range-slider"
          />
          <div className="range-marks">
            <span>25</span><span>100</span><span>250</span><span>500</span>
          </div>
        </section>
      )}

      <section className="cp-section">
        <div className="cp-label">POWIADOMIENIA</div>
        {permissionState === 'unsupported'
          ? <p className="info-text">Przeglądarka nie obsługuje push</p>
          : permissionState === 'denied'
            ? <p className="err" style={{ fontSize: 11 }}>✗ Zablokowane — odblokuj w ustawieniach przeglądarki</p>
            : isSubscribed
              ? <p className="ok">◉ Powiadomienia aktywne</p>
              : <button className="btn-subscribe" onClick={subscribe} disabled={isSubscribing}>
                  {isSubscribing ? '◌ Łączenie…' : 'Włącz powiadomienia'}
                </button>
        }
      </section>

      <section className="cp-section cp-refresh">
        <button className="btn-refresh" onClick={onRefresh}>
          ↻ Odśwież teraz
        </button>
        <span className="info-text">Auto co 5s</span>
      </section>
    </div>
  )
}
