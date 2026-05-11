import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import RadarMap, { TILE_LAYERS } from './components/RadarMap'
import AircraftInfoPanel from './components/AircraftInfoPanel'
import { useGeolocation } from './hooks/useGeolocation'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useLocalStorage } from './hooks/useLocalStorage'
import { fetchMilitaryAircraft } from './api'
import { version } from '../package.json'
import './App.css'

const EUROPE_CENTER = [52.0, 15.0]
const POLL_INTERVAL = 5_000
const TRAIL_MIN_INTERVAL_MS = 10_000
const TRAIL_MAX_AGE_MS = 60 * 60 * 1000  // 60 min — aligned closer to server's 4h cache
const SELECTION_GRACE_CYCLES = 2

export default function App() {
  const [aircraft, setAircraft] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [radius, setRadius] = useLocalStorage('radar.radius', 100)
  const [selectedHex, setSelectedHex] = useState(null)
  const [serverTrails, setServerTrails] = useState(new Map())
  const [trailSources, setTrailSources] = useState(new Map())
  const [activePanel, setActivePanel] = useState(null)
  const [activeTileId, setActiveTileId] = useLocalStorage('radar.tile', 'osm-adsbx')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [lastUpdatedTs, setLastUpdatedTs] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [inRangeCount, setInRangeCount] = useState(0)
  const [testPushStatus, setTestPushStatus] = useState(null)
  const [, forceTick] = useState(0)

  const alertedHexRef = useRef(new Set())
  const dismissedAlertsRef = useRef(new Set(loadDismissed()))
  const selectionMissCountRef = useRef(0)
  const trailsRef = useRef(new Map())
  const serverTrailFetchedRef = useRef(new Set())
  const isMountedRef = useRef(false)
  const fetchDataRef = useRef(null)
  const { location, locationError, requestLocation } = useGeolocation()
  const {
    isSubscribed, isSubscribing, subscribe, sendTestPush,
    permissionState, subscribeError, syncError, serverStatus,
  } = usePushNotifications(location, radius)

  const center = EUROPE_CENTER

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { aircraft: data, isDemo, source } = await fetchMilitaryAircraft(center, 2800)
      if (source === 'unavailable') {
        setError('API niedostępne')
        return
      }
      // Dedup by hex (B7)
      const seen = new Set()
      const dedup = data.filter(ac => {
        if (!ac.hex || seen.has(ac.hex)) return false
        seen.add(ac.hex)
        return true
      })
      const enriched = dedup.map(ac => {
        if (location) {
          const dist = haversine(location.lat, location.lon, ac.lat, ac.lon)
          return { ...ac, _dist: dist }
        }
        return ac
      })
      const now = Date.now()
      enriched.forEach(ac => {
        if (ac.lat == null || ac.lon == null) return
        const pts = trailsRef.current.get(ac.hex) || []
        const fresh = pts.filter(p => now - p.ts < TRAIL_MAX_AGE_MS)
        const last = fresh[fresh.length - 1]
        if (!last || now - last.ts >= TRAIL_MIN_INTERVAL_MS)
          fresh.push({ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro, ts: now })
        trailsRef.current.set(ac.hex, fresh)
      })
      const currentHexes = new Set(enriched.map(a => a.hex))
      for (const hex of trailsRef.current.keys())
        if (!currentHexes.has(hex)) trailsRef.current.delete(hex)
      for (const hex of serverTrailFetchedRef.current)
        if (!currentHexes.has(hex)) serverTrailFetchedRef.current.delete(hex)
      setAircraft(enriched)
      const tsNow = Date.now()
      setLastUpdatedTs(tsNow)
      setLastUpdated(new Date(tsNow).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      // B4: grace period — don't immediately drop selection if aircraft missing for one cycle
      setSelectedHex(prev => {
        if (!prev || currentHexes.has(prev)) {
          selectionMissCountRef.current = 0
          return prev
        }
        selectionMissCountRef.current++
        if (selectionMissCountRef.current >= SELECTION_GRACE_CYCLES) {
          selectionMissCountRef.current = 0
          return null
        }
        return prev
      })
      setServerTrails(prev => {
        if (prev.size === 0) return prev
        const next = new Map(prev)
        for (const hex of next.keys()) if (!currentHexes.has(hex)) next.delete(hex)
        return next.size === prev.size ? prev : next
      })
      setTrailSources(prev => {
        if (prev.size === 0) return prev
        const next = new Map(prev)
        for (const hex of next.keys()) if (!currentHexes.has(hex)) next.delete(hex)
        return next.size === prev.size ? prev : next
      })
      if (location && !isDemo) {
        const inRange = enriched.filter(ac => ac._dist != null && ac._dist <= radius)
        setInRangeCount(inRange.length)
        // Fire one-time effects (vibration + OS notification) for newly entered aircraft
        inRange.forEach(ac => {
          if (!alertedHexRef.current.has(ac.hex)) {
            alertedHexRef.current.add(ac.hex)
            dismissedAlertsRef.current.delete(ac.hex)
            persistDismissed(dismissedAlertsRef.current)
            navigator.vibrate?.([200, 100, 200])
            playAlertSound()
            triggerNotification(ac, ac._dist)
          }
        })
        // Persistent alerts = all in-range aircraft not manually dismissed
        setAlerts(
          inRange
            .filter(ac => !dismissedAlertsRef.current.has(ac.hex))
            .map(ac => ({ hex: ac.hex, ac, dist: ac._dist }))
        )
        // When aircraft leaves radar: reset so it can re-alert on return
        let dirty = false
        for (const h of alertedHexRef.current) {
          if (!currentHexes.has(h)) {
            alertedHexRef.current.delete(h)
            if (dismissedAlertsRef.current.delete(h)) dirty = true
          }
        }
        if (dirty) persistDismissed(dismissedAlertsRef.current)
      } else {
        // GPS lost or demo mode — clear stale alerts
        setAlerts([])
        setInRangeCount(0)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [radius, location])

  // Keep ref fresh so stable interval always calls latest closure
  fetchDataRef.current = fetchData

  // Auto-start GPS tracking on mount
  useEffect(() => { requestLocation() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Stable interval — never restarts on GPS location updates
  useEffect(() => {
    fetchDataRef.current()
    const id = setInterval(() => fetchDataRef.current(), POLL_INTERVAL)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Immediate refetch on radius change
  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return }
    fetchDataRef.current()
  }, [radius]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live "X s temu" tick (U9) — only ticks while we have a timestamp
  useEffect(() => {
    if (!lastUpdatedTs) return
    const id = setInterval(() => forceTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [lastUpdatedTs])

  // ESC closes panel first, then deselects aircraft (B12 — skip when typing)
  useEffect(() => {
    const handler = e => {
      if (e.key !== 'Escape') return
      const tag = (e.target?.tagName || '').toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      if (activePanel) setActivePanel(null)
      else setSelectedHex(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePanel])

  useEffect(() => {
    if (!selectedHex) {
      serverTrailFetchedRef.current.clear()
      return
    }
    if (selectedHex.startsWith('__')) return
    if (serverTrailFetchedRef.current.has(selectedHex)) return
    serverTrailFetchedRef.current.add(selectedHex)
    fetch(`/.netlify/functions/aircraft?hex=${selectedHex}`)
      .then(r => r.json())
      .then(({ trail, sources }) => {
        if (sources) {
          setTrailSources(prev => { const next = new Map(prev); next.set(selectedHex, sources); return next })
        }
        if (!trail?.length) return
        setServerTrails(prev => { const next = new Map(prev); next.set(selectedHex, trail); return next })
      })
      .catch(() => {})
  }, [selectedHex])

  function togglePanel(name) {
    setActivePanel(p => p === name ? null : name)
  }

  // B3: memoize gpsCenter so RadarMap props are stable
  const gpsCenter = useMemo(
    () => location ? [location.lat, location.lon] : null,
    [location?.lat, location?.lon]
  )

  // Determine which hex are in-range for visual distinction on the map (U5)
  const inRangeHexes = useMemo(() => {
    if (!location) return null
    const s = new Set()
    for (const ac of aircraft) if (ac._dist != null && ac._dist <= radius) s.add(ac.hex)
    return s
  }, [aircraft, location, radius])

  const selectedAc = aircraft.find(ac => ac.hex === selectedHex) || null
  const freshness = lastUpdatedTs ? formatFreshness(Date.now() - lastUpdatedTs) : null

  async function handleTestPush() {
    setTestPushStatus({ kind: 'loading' })
    const res = await sendTestPush()
    if (res.ok) setTestPushStatus({ kind: 'ok' })
    else setTestPushStatus({ kind: 'err', detail: res.error })
    setTimeout(() => setTestPushStatus(null), 6000)
  }

  return (
    <div className={`app${activePanel ? ' panel-open' : ''}`}>
      <RadarMap
        aircraft={aircraft}
        trails={trailsRef}
        serverTrails={serverTrails}
        center={center}
        gpsCenter={gpsCenter}
        radius={location ? radius : null}
        selectedHex={selectedHex}
        inRangeHexes={inRangeHexes}
        onSelect={hex => {
          setSelectedHex(prev => prev === hex ? null : hex)
          if (hex) setActivePanel(null)
        }}
        activeTileId={activeTileId}
      />

      {/* Aircraft count + GPS status — bottom left */}
      <div className="map-overlay-count">
        {aircraft.length} OBJ
        {alerts.length > 0 && (
          <span className="count-in-range">⚠ {alerts.length} W ZASIĘGU</span>
        )}
        {location
          ? <span className="count-gps-ok">◉ GPS</span>
          : locationError
            ? <span className="count-gps-err">✗ GPS</span>
            : <span className="count-gps-wait">◌ GPS</span>}
        {freshness && (
          <span className={freshness.stale ? 'count-fresh-stale' : 'count-fresh'}>{freshness.label}</span>
        )}
        <span className="count-version">v{version}</span>
      </div>

      {/* Logo — top left */}
      <div className="map-logo">
        <span className="map-logo-icon">◎</span>
        <span className="map-logo-name">RADAR WOJSKOWY</span>
        {isLoading && <span className="map-logo-spinner">◌</span>}
        {error && !isLoading && <span className="map-logo-error" title={error}>!</span>}
        {lastUpdated && !isLoading && !error && <span className="map-logo-ts">{lastUpdated}</span>}
      </div>

      {/* Aircraft info panel — left, below logo */}
      {selectedAc && (
        <AircraftInfoPanel
          ac={selectedAc}
          trailSources={trailSources.get(selectedHex)}
          onClose={() => setSelectedHex(null)}
        />
      )}

      {/* Control buttons — top right */}
      <div className="map-ctrl-btns">
        <button className={`map-ctrl-btn ${activePanel === 'ustawienia' ? 'active' : ''}`}
          onClick={() => togglePanel('ustawienia')}>USTAW</button>
        <button className={`map-ctrl-btn ${activePanel === 'mapy' ? 'active' : ''}`}
          onClick={() => togglePanel('mapy')}>MAPY</button>
        <button className={`map-ctrl-btn ${activePanel === 'powiadomienia' ? 'active' : ''}`}
          onClick={() => togglePanel('powiadomienia')}>PUSH</button>
      </div>

      {/* Alert toasts — persistent until aircraft leaves range or user dismisses */}
      {alerts.length > 0 && (
        <div className="alert-stack">
          {alerts.slice(0, 3).map(({ hex, ac, dist }) => (
            <div key={hex} className="alert-toast"
              onClick={() => {
                if (hex.startsWith('__')) return
                setSelectedHex(ac.hex)
                setActivePanel(null)
              }}>
              <div className="alert-toast-body">
                <span className="alert-toast-tag">⚠ W ZASIĘGU</span>
                <span className="alert-toast-call">{ac.flight?.trim() || ac.hex}</span>
                <span className="alert-toast-detail">{ac.t || '?'} · {Math.round(dist)} km</span>
              </div>
              <button className="alert-toast-close"
                onClick={e => {
                  e.stopPropagation()
                  if (!hex.startsWith('__')) {
                    dismissedAlertsRef.current.add(hex)
                    persistDismissed(dismissedAlertsRef.current)
                  }
                  setAlerts(prev => prev.filter(a => a.hex !== hex))
                }}>✕</button>
            </div>
          ))}
          {alerts.length > 3 && (
            <div className="alert-toast-overflow">+{alerts.length - 3} więcej w zasięgu</div>
          )}
        </div>
      )}

      {/* Side panel backdrop — mobile only (U10) */}
      {activePanel && (
        <div className="side-panel-backdrop" onClick={() => setActivePanel(null)} />
      )}

      {/* Side panels — slide from right */}
      {activePanel && (
        <div className="side-panel">
          <div className="side-panel-header">
            <span className="side-panel-title">
              {activePanel === 'ustawienia' && 'USTAWIENIA'}
              {activePanel === 'mapy' && 'MAPY'}
              {activePanel === 'powiadomienia' && 'POWIADOMIENIA'}
            </span>
            <button className="side-panel-close" onClick={() => setActivePanel(null)}>✕</button>
          </div>

          {activePanel === 'ustawienia' && (
            <div className="panel-body">
              <section className="cp-section">
                <div className="cp-label">GPS — wymagany do alertów</div>
                {location
                  ? <p className="ok">◉ {location.lat.toFixed(4)}°N {location.lon.toFixed(4)}°E</p>
                  : locationError
                    ? <>
                        <p className="err" style={{ fontSize: 11 }}>✗ {locationError}</p>
                        <p className="info-text" style={{ marginTop: 4 }}>
                          Bez GPS alerty nie działają. Odblokuj lokalizację w ustawieniach przeglądarki.
                        </p>
                      </>
                    : <>
                        <p className="info-text">Oczekiwanie na GPS…</p>
                        <button className="link-btn" style={{ marginTop: 4 }} onClick={requestLocation}>Pobierz lokalizację</button>
                      </>}
              </section>
              <section className="cp-section">
                <div className="cp-label">ZASIĘG ALERTÓW: {radius} km</div>
                <input type="range" min="25" max="500" step="25" value={radius}
                  onChange={e => setRadius(Number(e.target.value))} className="range-slider" />
                <div className="range-marks"><span>25</span><span>100</span><span>250</span><span>500</span></div>
                {location && (
                  <p className="info-text" style={{ marginTop: 6 }}>
                    W zasięgu teraz: <strong style={{ color: inRangeCount > 0 ? '#ff5520' : '#00ff88' }}>
                      {inRangeCount} samolotów
                    </strong>
                  </p>
                )}
              </section>
              <section className="cp-section cp-refresh">
                <button className="btn-refresh" onClick={fetchData}>↻ Odśwież</button>
              </section>
              {error && <p className="err" style={{ fontSize: 11, marginTop: 8 }}>✗ {error}</p>}
              <p className="info-text" style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                v{version} · Jeśli alerty nie działają: zamknij i otwórz app ponownie (wymuś odświeżenie).
              </p>
            </div>
          )}

          {activePanel === 'mapy' && (
            <div className="panel-body">
              <div className="cp-label">WYBIERZ MAPĘ</div>
              <div className="map-layer-list">
                {TILE_LAYERS.map(layer => (
                  <button key={layer.id}
                    className={`map-layer-item ${activeTileId === layer.id ? 'active' : ''}`}
                    onClick={() => setActiveTileId(layer.id)}>
                    <span className="map-layer-name">{layer.name}</span>
                    {activeTileId === layer.id && <span className="map-layer-check">◉</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activePanel === 'powiadomienia' && (
            <div className="panel-body">
              <section className="cp-section">
                <div className="cp-label">POWIADOMIENIA PUSH</div>
                {permissionState === 'unsupported'
                  ? <p className="info-text">Przeglądarka nie obsługuje push notifications.</p>
                  : permissionState === 'denied'
                    ? <p className="err" style={{ fontSize: 11 }}>✗ Zablokowane — odblokuj w ustawieniach przeglądarki</p>
                    : isSubscribed
                      ? <p className="ok">◉ Powiadomienia aktywne</p>
                      : <>
                          <button className="btn-subscribe" onClick={subscribe} disabled={isSubscribing}>
                            {isSubscribing ? '◌ Łączenie…' : 'Włącz powiadomienia'}
                          </button>
                          {subscribeError && <p className="err" style={{ fontSize: 11, marginTop: 6 }}>✗ {subscribeError}</p>}
                        </>
                }
                <p className="info-text" style={{ marginTop: 6 }}>
                  Alert gdy wojskowy samolot pojawi się w zasięgu GPS — nawet gdy aplikacja jest zamknięta. Sprawdzane co 5 minut przez serwer.
                </p>
              </section>
              {isSubscribed && (
                <section className="cp-section">
                  <div className="cp-label">TESTOWY PUSH</div>
                  <button
                    className="btn-refresh"
                    onClick={handleTestPush}
                    disabled={testPushStatus?.kind === 'loading'}>
                    {testPushStatus?.kind === 'loading' ? '◌ Wysyłanie…' : '⚠ Wyślij testowy push z serwera'}
                  </button>
                  {testPushStatus?.kind === 'ok' && (
                    <p className="ok" style={{ fontSize: 11, marginTop: 6 }}>
                      ◉ Wysłane. Jeśli nie dostałeś powiadomienia — problem z APNS/iOS.
                    </p>
                  )}
                  {testPushStatus?.kind === 'err' && (
                    <p className="err" style={{ fontSize: 11, marginTop: 6, wordBreak: 'break-all' }}>
                      ✗ {testPushStatus.detail}
                    </p>
                  )}
                </section>
              )}
              {isSubscribed && (
                <section className="cp-section">
                  <div className="cp-label">POZYCJA NA SERWERZE</div>
                  {location
                    ? <p className="ok" style={{ fontSize: 11 }}>◉ {location.lat.toFixed(4)}°N {location.lon.toFixed(4)}°E · zasięg {radius} km</p>
                    : <p className="err" style={{ fontSize: 11 }}>✗ Brak GPS — serwer nie wyśle alertów bez pozycji.<br/>
                        <button className="link-btn" style={{ marginTop: 4 }} onClick={requestLocation}>Pobierz lokalizację</button>
                      </p>
                  }
                  {syncError && (
                    <p className="err" style={{ fontSize: 11, marginTop: 6 }}>
                      ✗ Błąd synchronizacji z serwerem: {syncError}
                    </p>
                  )}
                </section>
              )}
              {isSubscribed && (
                <section className="cp-section">
                  <div className="cp-label">DIAGNOSTYKA SERWERA</div>
                  {!serverStatus
                    ? <p className="info-text" style={{ fontSize: 11 }}>◌ Pobieranie statusu…</p>
                    : <div style={{ fontSize: 11, fontFamily: "'Courier New', monospace", lineHeight: 1.7 }}>
                        <div className={serverStatus.ok ? 'ok' : 'err'}>
                          {serverStatus.ok ? '◉' : '✗'} {' '}
                          {serverStatus.reason === 'ready' && 'Gotowe do wysyłki'}
                          {serverStatus.reason === 'no-gps' && 'Brak GPS na serwerze'}
                          {serverStatus.reason === 'stale-gps' && 'Pozycja >7 dni (przeterminowana)'}
                          {serverStatus.reason === 'not-registered' && 'Subskrypcja nie zapisana!'}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.55)' }}>
                          Provider: <span style={{ color: '#fff' }}>{serverStatus.provider}</span>
                          {serverStatus.provider === 'apple' && ' (iOS APNS)'}
                        </div>
                        {serverStatus.gpsAgeMs != null && (
                          <div style={{ color: 'rgba(255,255,255,0.55)' }}>
                            Wiek GPS: <span style={{ color: '#fff' }}>{formatAge(serverStatus.gpsAgeMs)}</span>
                          </div>
                        )}
                        {serverStatus.server && (
                          <>
                            <div style={{ color: 'rgba(255,255,255,0.55)' }}>
                              VAPID skonfig.: <span className={serverStatus.server.vapidConfigured ? 'ok' : 'err'}>
                                {serverStatus.server.vapidConfigured ? 'tak' : 'NIE'}
                              </span>
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.55)', wordBreak: 'break-all' }}>
                              VAPID subject: <span style={{ color: '#fff' }}>{serverStatus.server.vapidSubject}</span>
                            </div>
                          </>
                        )}
                        {serverStatus.storeErrors && serverStatus.storeErrors.length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <div className="err">Błędy blob store:</div>
                            {serverStatus.storeErrors.map((e, i) => (
                              <div key={i} className="err" style={{ fontSize: 10, wordBreak: 'break-all' }}>· {e}</div>
                            ))}
                          </div>
                        )}
                        {serverStatus.latestRun && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ color: 'rgba(255,255,255,0.55)' }}>Ostatni cron:</div>
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>
                              {new Date(serverStatus.latestRun.startedAt).toLocaleString('pl-PL')}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.55)' }}>
                              Subskrypcji: <span style={{ color: '#fff' }}>{serverStatus.latestRun.totalSubs}</span>
                              {' · '}
                              Wysłano: <span style={{ color: '#fff' }}>{serverStatus.latestRun.notificationsSent}</span>
                              {' · '}
                              Błędów: <span className={serverStatus.latestRun.pushErrors > 0 ? 'err' : ''}>{serverStatus.latestRun.pushErrors}</span>
                            </div>
                            {serverStatus.latestRun.skippedNoGps > 0 && (
                              <div className="err">
                                Pominięto (brak GPS): {serverStatus.latestRun.skippedNoGps}
                              </div>
                            )}
                            {serverStatus.latestRun.skippedStaleGps > 0 && (
                              <div className="err">
                                Pominięto (stary GPS): {serverStatus.latestRun.skippedStaleGps}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                  }
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function loadDismissed() {
  try {
    const raw = localStorage.getItem('radar.dismissed')
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function persistDismissed(set) {
  try {
    localStorage.setItem('radar.dismissed', JSON.stringify([...set].filter(h => !h.startsWith('__'))))
  } catch {}
}

function formatAge(ms) {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)} dni`
}

function formatFreshness(ms) {
  const s = Math.round(ms / 1000)
  const stale = s > 30
  if (s < 5) return { label: '◉ live', stale: false }
  if (s < 60) return { label: `${s}s temu`, stale }
  const m = Math.floor(s / 60)
  return { label: `${m} min temu`, stale: true }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

let alertAudio = null
function playAlertSound() {
  try {
    if (!alertAudio) {
      // Short synthesized ping — generated once, reused
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      alertAudio = () => {
        const ctx = new AC()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.4)
        setTimeout(() => ctx.close(), 600)
      }
    }
    alertAudio()
  } catch {}
}

function triggerNotification(ac, dist) {
  if (!('serviceWorker' in navigator)) return
  if (Notification.permission !== 'granted') {
    console.debug('[notify] skipped: permission =', Notification.permission)
    return
  }
  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification('Wojskowy samolot w zasięgu!', {
      body: `${ac.flight?.trim() || ac.hex} (${ac.t || 'nieznany typ'}) — ${Math.round(dist)} km`,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: ac.hex,
      renotify: false,
      data: { hex: ac.hex },
    })
  })
}
