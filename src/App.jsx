import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import RadarMap, { TILE_LAYERS } from './components/RadarMap'
import AircraftList from './components/AircraftList'
import AuthScreen from './components/AuthScreen'
import { useGeolocation } from './hooks/useGeolocation'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useAuth } from './hooks/useAuth'
import { fetchMilitaryAircraft } from './api'
import './App.css'

const POLAND_CENTER = [52.0, 19.5]
const EUROPE_CENTER = [52.0, 15.0]
const POLL_INTERVAL = 5_000
const TRAIL_MIN_INTERVAL_MS = 20_000
const TRAIL_MAX_AGE_MS = 15 * 60 * 1000

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth()
  const [aircraft, setAircraft] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const [mode, setMode] = useState('gps')
  const [radius, setRadius] = useState(100)
  const [selectedHex, setSelectedHex] = useState(null)
  const [serverTrails, setServerTrails] = useState(new Map())
  const [activePanel, setActivePanel] = useState(null)
  const [activeTileId, setActiveTileId] = useState('osm-adsbx')

  const alertedHexRef = useRef(new Set())
  const trailsRef = useRef(new Map())
  const serverTrailFetchedRef = useRef(new Set())

  const { location, locationError, requestLocation } = useGeolocation()
  const { isSubscribed, isSubscribing, subscribe, permissionState } = usePushNotifications(location, radius)
  const pollRef = useRef(null)

  const center = useMemo(() => {
    if (mode === 'poland') return POLAND_CENTER
    if (mode === 'europe') return EUROPE_CENTER
    return location ? [location.lat, location.lon] : POLAND_CENTER
  }, [mode, location?.lat, location?.lon])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { aircraft: data, source, isDemo } = await fetchMilitaryAircraft(
        center,
        mode === 'poland' ? 400 : mode === 'europe' ? 2800 : radius
      )

      const enriched = data.map(ac => {
        if (mode === 'gps' && location) {
          const dist = haversine(location.lat, location.lon, ac.lat, ac.lon)
          return { ...ac, _inRadius: dist <= radius, _dist: dist }
        }
        return ac
      })

      const now = Date.now()
      enriched.forEach(ac => {
        if (ac.lat == null || ac.lon == null) return
        const pts = trailsRef.current.get(ac.hex) || []
        const fresh = pts.filter(p => now - p.ts < TRAIL_MAX_AGE_MS)
        const last = fresh[fresh.length - 1]
        if (!last || now - last.ts >= TRAIL_MIN_INTERVAL_MS) {
          fresh.push({ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro, ts: now })
        }
        trailsRef.current.set(ac.hex, fresh)
      })
      const currentHexes = new Set(enriched.map(a => a.hex))
      for (const hex of trailsRef.current.keys()) {
        if (!currentHexes.has(hex)) trailsRef.current.delete(hex)
      }

      setAircraft(enriched)
      setDataSource(isDemo ? 'demo' : source)
      setSelectedHex(prev => (prev && !currentHexes.has(prev) ? null : prev))

      if (mode === 'gps' && location && !isDemo) {
        enriched.forEach(ac => {
          if (!alertedHexRef.current.has(ac.hex) && ac._dist <= radius) {
            triggerNotification(ac, ac._dist)
            alertedHexRef.current.add(ac.hex)
          }
        })
        for (const h of alertedHexRef.current) {
          if (!currentHexes.has(h)) alertedHexRef.current.delete(h)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [center, radius, mode, location])

  useEffect(() => {
    fetchData()
    pollRef.current = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [fetchData])

  useEffect(() => {
    if (!selectedHex || serverTrailFetchedRef.current.has(selectedHex)) return
    serverTrailFetchedRef.current.add(selectedHex)
    fetch(`/.netlify/functions/aircraft?hex=${selectedHex}`)
      .then(r => r.json())
      .then(({ trail }) => {
        if (!trail?.length) return
        setServerTrails(prev => {
          const next = new Map(prev)
          next.set(selectedHex, trail)
          return next
        })
      })
      .catch(() => {})
  }, [selectedHex])

  function togglePanel(name) {
    setActivePanel(p => p === name ? null : name)
  }

  if (authLoading) return null
  if (!user) return <AuthScreen onLogin={login} />

  return (
    <div className="app">
      <RadarMap
        aircraft={aircraft}
        trails={trailsRef}
        serverTrails={serverTrails}
        center={center}
        radius={mode === 'gps' ? radius : null}
        mode={mode}
        selectedHex={selectedHex}
        onSelect={setSelectedHex}
        activeTileId={activeTileId}
      />

      {/* Logo overlay */}
      <div className="map-logo">
        <span className="map-logo-icon">◎</span>
        <span className="map-logo-name">RADAR WOJSKOWY</span>
        {dataSource === 'demo' && <span className="map-logo-demo">DEMO</span>}
        {isLoading && <span className="map-logo-spinner">◌</span>}
        <button className="map-logo-logout" onClick={logout} title="Wyloguj">⏻</button>
      </div>

      {/* Control buttons */}
      <div className="map-ctrl-btns">
        <button
          className={`map-ctrl-btn ${activePanel === 'tryby' ? 'active' : ''}`}
          onClick={() => togglePanel('tryby')}
        >Tryb</button>
        <button
          className={`map-ctrl-btn ${activePanel === 'powiadomienia' ? 'active' : ''} ${isSubscribed ? 'subscribed' : ''}`}
          onClick={() => togglePanel('powiadomienia')}
        >Powiadomienia</button>
        <button
          className={`map-ctrl-btn ${activePanel === 'obiekty' ? 'active' : ''}`}
          onClick={() => togglePanel('obiekty')}
        >Obiekty<span className="btn-count">{aircraft.length}</span></button>
        <button
          className={`map-ctrl-btn ${activePanel === 'mapy' ? 'active' : ''}`}
          onClick={() => togglePanel('mapy')}
        >Mapy</button>
      </div>

      {/* Side panel */}
      {activePanel && (
        <div className="side-panel">
          <div className="side-panel-header">
            <span className="side-panel-title">
              {activePanel === 'tryby' && 'TRYB'}
              {activePanel === 'powiadomienia' && 'POWIADOMIENIA'}
              {activePanel === 'obiekty' && `OBIEKTY (${aircraft.length})`}
              {activePanel === 'mapy' && 'MAPY'}
            </span>
            <button className="side-panel-close" onClick={() => setActivePanel(null)}>✕</button>
          </div>

          {activePanel === 'tryby' && (
            <div className="panel-body">
              <section className="cp-section">
                <div className="cp-label">TRYB</div>
                <div className="btn-group">
                  <button className={`btn-mode ${mode === 'gps' ? 'active' : ''}`}
                    onClick={() => { setMode('gps'); if (!location) requestLocation() }}>GPS</button>
                  <button className={`btn-mode ${mode === 'poland' ? 'active' : ''}`}
                    onClick={() => setMode('poland')}>Polska</button>
                  <button className={`btn-mode ${mode === 'europe' ? 'active' : ''}`}
                    onClick={() => setMode('europe')}>Europa</button>
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
                  <input type="range" min="25" max="500" step="25" value={radius}
                    onChange={e => setRadius(Number(e.target.value))} className="range-slider" />
                  <div className="range-marks">
                    <span>25</span><span>100</span><span>250</span><span>500</span>
                  </div>
                </section>
              )}

              <section className="cp-section cp-refresh">
                <button className="btn-refresh" onClick={fetchData}>↻ Odśwież teraz</button>
                <span className="info-text">Auto co 5s</span>
              </section>

              {error && <p className="err" style={{ fontSize: 11, marginTop: 8 }}>✗ {error}</p>}
            </div>
          )}

          {activePanel === 'powiadomienia' && (
            <div className="panel-body">
              <section className="cp-section">
                <div className="cp-label">PUSH NOTIFICATIONS</div>
                {permissionState === 'unsupported'
                  ? <p className="info-text">Przeglądarka nie obsługuje push notifications.</p>
                  : permissionState === 'denied'
                    ? <p className="err" style={{ fontSize: 11 }}>✗ Zablokowane — odblokuj w ustawieniach przeglądarki</p>
                    : isSubscribed
                      ? <p className="ok">◉ Powiadomienia aktywne</p>
                      : <button className="btn-subscribe" onClick={subscribe} disabled={isSubscribing}>
                          {isSubscribing ? '◌ Łączenie…' : 'Włącz powiadomienia'}
                        </button>
                }
              </section>
              <p className="info-text" style={{ marginTop: 4 }}>
                Otrzymasz alert gdy wojskowy samolot znajdzie się w wybranym zasięgu GPS, nawet gdy aplikacja jest zamknięta.
              </p>
            </div>
          )}

          {activePanel === 'obiekty' && (
            <AircraftList
              aircraft={aircraft}
              userLocation={location}
              selectedHex={selectedHex}
              onSelect={(hex) => { setSelectedHex(hex); setActivePanel(null) }}
              mode={mode}
            />
          )}

          {activePanel === 'mapy' && (
            <div className="panel-body">
              <div className="cp-label">WYBIERZ MAPĘ</div>
              <div className="map-layer-list">
                {TILE_LAYERS.map(layer => (
                  <button
                    key={layer.id}
                    className={`map-layer-item ${activeTileId === layer.id ? 'active' : ''}`}
                    onClick={() => setActiveTileId(layer.id)}
                  >
                    <span className="map-layer-name">{layer.name}</span>
                    {activeTileId === layer.id && <span className="map-layer-check">◉</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function triggerNotification(ac, dist) {
  if ('serviceWorker' in navigator && Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification('Wojskowy samolot w zasięgu!', {
        body: `${ac.flight?.trim() || ac.hex} (${ac.t || 'nieznany typ'}) — ${Math.round(dist)} km`,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: ac.hex,
        renotify: false,
        data: { hex: ac.hex }
      })
    })
  }
}
