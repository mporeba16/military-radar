import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import RadarMap from './components/RadarMap'
import AircraftInfoPanel from './components/AircraftInfoPanel'
import SettingsPanel from './components/SettingsPanel'
import MapsPanel from './components/MapsPanel'
import { useGeolocation } from './hooks/useGeolocation'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useLocalStorage } from './hooks/useLocalStorage'
import { fetchMilitaryAircraft } from './api'
import { haversine, bearing } from './lib/geo'
import { t } from './i18n'
import { version } from '../package.json'
import './App.css'

const EUROPE_CENTER = [52.0, 15.0]
const POLL_INTERVAL = 5_000
const TRAIL_MIN_INTERVAL_MS = 10_000
const TRAIL_MAX_AGE_MS = 60 * 60 * 1000  // 60 min — aligned closer to server's 4h cache
const TRAIL_FLIGHT_SPLIT_GAP_MS = 10 * 60 * 1000  // gap → reset client trail (new flight)
const SELECTION_GRACE_CYCLES = 2

export default function App() {
  const [aircraft, setAircraft] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [error, setError] = useState(null)
  const [radius, setRadius] = useLocalStorage('radar.radius', 100)
  const [kinds, setKinds] = useLocalStorage('radar.kinds', { mil: true, heli: true, heavy: true })
  const [soundOn, setSoundOn] = useLocalStorage('radar.sound', true)
  const [vibrateOn, setVibrateOn] = useLocalStorage('radar.vibrate', true)
  const [selectedHex, setSelectedHex] = useState(null)
  const [serverTrails, setServerTrails] = useState(new Map())
  const [trailSources, setTrailSources] = useState(new Map())
  const [activePanel, setActivePanel] = useState(null)
  const [activeTileId, setActiveTileId] = useLocalStorage('radar.tile', 'osm-adsbx')
  const [showBases, setShowBases] = useLocalStorage('radar.bases', true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [inRangeCount, setInRangeCount] = useState(0)
  const [testPushStatus, setTestPushStatus] = useState(null)
  const [debugUnlocked, setDebugUnlocked] = useState(() => {
    try { return new URLSearchParams(window.location.search).has('debug') } catch { return false }
  })
  const versionTapsRef = useRef({ count: 0, timer: null })

  // Ref tak, aby fetchData (zależne tylko od radius/location) widziało aktualne
  // filtry bez przepinania interwału przy każdym przełączeniu kategorii.
  const kindsRef = useRef(kinds)
  kindsRef.current = kinds

  const alertedHexRef = useRef(new Set())
  const dismissedAlertsRef = useRef(new Set(loadDismissed()))
  const selectionMissCountRef = useRef(0)
  const trailsRef = useRef(new Map())
  const firstSeenRef = useRef(new Map())
  const isMountedRef = useRef(false)
  const fetchDataRef = useRef(null)
  const fetchAbortRef = useRef(null)
  const testPushTimerRef = useRef(null)
  const { location, accuracy, locationError, requestLocation } = useGeolocation()
  const {
    isSubscribed, subResolved, isSubscribing, subscribe, unsubscribe, sendTestPush,
    permissionState, subscribeError, syncError, serverStatus,
  } = usePushNotifications(location, radius)

  // Gdy aktywny jest push serwerowy, NIE strzelamy też lokalnym powiadomieniem
  // systemowym — inaczej (w foreground) ten sam samolot daje dwa komunikaty.
  // W aplikacji i tak zostają toast + dźwięk + wibracja.
  const isSubscribedRef = useRef(false)
  isSubscribedRef.current = isSubscribed
  // Dopóki nie wiemy, czy push jest aktywny, NIE odpalamy lokalnego fallbacku —
  // inaczej w oknie startowym (zanim getSubscription się rozwiąże) ten sam
  // samolot dałby lokalne powiadomienie + push serwera = dublet.
  const subResolvedRef = useRef(false)
  subResolvedRef.current = subResolved

  // Dźwięk i wibracja w aplikacji — niezależne przełączniki (push systemowy działa
  // osobno). Ref, żeby pętla fetchData widziała aktualną wartość bez przepinania
  // interwału.
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const vibrateRef = useRef(vibrateOn)
  vibrateRef.current = vibrateOn

  const center = EUROPE_CENTER

  // Derive in-range count + persistent alert list from an already-fetched
  // aircraft array (each carries `_dist` relative to the current GPS fix).
  // Shared by the poll (fireEffects=true → vibrate/sound/OS-notification for
  // newly entered aircraft) and the radius slider (fireEffects=false → just
  // recompute the UI, no buzz, no network refetch). Keeping this in one place
  // stops the two callers from drifting apart.
  const applyInRange = useCallback((list, fireEffects) => {
    if (!location) { setAlerts([]); setInRangeCount(0); return }
    const inRange = list.filter(ac =>
      ac._dist != null && ac._dist <= radius && kindsRef.current[ac.kind || 'mil'])
    setInRangeCount(inRange.length)
    inRange.forEach(ac => {
      if (!alertedHexRef.current.has(ac.hex)) {
        // Mark as seen either way, so widening the radius doesn't make the very
        // next poll treat these as "new" and buzz a moment later.
        alertedHexRef.current.add(ac.hex)
        dismissedAlertsRef.current.delete(ac.hex)
        persistDismissed(dismissedAlertsRef.current)
        if (fireEffects) {
          if (vibrateRef.current) navigator.vibrate?.([200, 100, 200])
          if (soundRef.current) playAlertSound()
          // Push serwerowy obsłuży powiadomienie systemowe — lokalne tylko
          // gdy znamy już stan subskrypcji i użytkownik NIE jest zapisany.
          if (subResolvedRef.current && !isSubscribedRef.current) {
            triggerNotification(ac, ac._dist)
          }
        }
      }
    })
    setAlerts(
      inRange
        .filter(ac => !dismissedAlertsRef.current.has(ac.hex))
        .map(ac => ({ hex: ac.hex, ac, dist: ac._dist }))
    )
  }, [location, radius])
  const applyInRangeRef = useRef(applyInRange)
  applyInRangeRef.current = applyInRange

  const fetchData = useCallback(async () => {
    // Abort any in-flight fetch — fixes race where slower request returns
    // last and overwrites fresher data with stale results.
    fetchAbortRef.current?.abort()
    const ctrl = new AbortController()
    fetchAbortRef.current = ctrl

    setIsLoading(true)
    setError(null)
    try {
      const { aircraft: data, isDemo, source } = await fetchMilitaryAircraft(center, 2800, ctrl.signal)
      if (ctrl.signal.aborted) return
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
      const now = Date.now()
      const enriched = dedup.map(ac => {
        if (!firstSeenRef.current.has(ac.hex)) {
          firstSeenRef.current.set(ac.hex, now)
        }
        if (location) {
          const dist = haversine(location.lat, location.lon, ac.lat, ac.lon)
          const brg = bearing(location.lat, location.lon, ac.lat, ac.lon)
          return { ...ac, _dist: dist, _bearing: brg }
        }
        return ac
      })
      enriched.forEach(ac => {
        if (ac.lat == null || ac.lon == null) return
        // Don't record trail for grounded aircraft — keeps the trail a "current
        // flight only" view and lets server-side gap detection do its job.
        if (ac.on_ground) return
        // MLAT-only positions are noisy (jump around in poor ADS-B coverage)
        // and cause zigzags. Skip them.
        if (ac.mlat) return
        const pts = trailsRef.current.get(ac.hex) || []
        let fresh = pts.filter(p => now - p.ts < TRAIL_MAX_AGE_MS)
        const last = fresh[fresh.length - 1]
        // Gap > 10 min → treat as new flight, discard old client points
        if (last && now - last.ts > TRAIL_FLIGHT_SPLIT_GAP_MS) {
          fresh = []
        }
        const lastFresh = fresh[fresh.length - 1]
        if (!lastFresh || now - lastFresh.ts >= TRAIL_MIN_INTERVAL_MS)
          fresh.push({ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro, ts: now })
        trailsRef.current.set(ac.hex, fresh)
      })
      const currentHexes = new Set(enriched.map(a => a.hex))
      for (const hex of trailsRef.current.keys())
        if (!currentHexes.has(hex)) trailsRef.current.delete(hex)
      for (const hex of firstSeenRef.current.keys())
        if (!currentHexes.has(hex)) firstSeenRef.current.delete(hex)
      setAircraft(enriched)
      setHasFetched(true)
      setLastUpdated(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
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
        // Derive alerts + fire one-time effects for newly entered aircraft.
        applyInRange(enriched, true)
        // When aircraft leaves the feed entirely: reset so it can re-alert on return
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
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      if (fetchAbortRef.current === ctrl) {
        setIsLoading(false)
        fetchAbortRef.current = null
      }
    }
  }, [radius, location, applyInRange])

  // Keep ref fresh so stable interval always calls latest closure
  fetchDataRef.current = fetchData

  // Latest aircraft snapshot, so the radius slider can recompute alerts from
  // the data we already have instead of refetching.
  const aircraftRef = useRef(aircraft)
  aircraftRef.current = aircraft

  // Auto-start GPS tracking on mount
  useEffect(() => { requestLocation() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear the test-push status timeout on unmount (avoids setState on a gone
  // component if the panel closes mid-countdown).
  useEffect(() => () => {
    if (testPushTimerRef.current) clearTimeout(testPushTimerRef.current)
  }, [])

  // Polling that pauses with the tab and resumes cleanly.
  //
  // Earlier version had a `booted` flag that protected the deferred first
  // fetch from running twice — but it ALSO blocked the immediate refresh
  // when the tab became visible again. Result: iOS PWA users returning to
  // the app after a minute saw stale aircraft positions forever.
  //
  // Now: only the very first kickoff is deferred via requestIdleCallback.
  // Subsequent resumes call tick() immediately so the map refreshes the
  // moment the user comes back.
  useEffect(() => {
    let id = null
    let firstBoot = true
    const tick = () => fetchDataRef.current()
    const start = () => {
      if (id != null) return
      const begin = () => {
        tick()
        id = setInterval(tick, POLL_INTERVAL)
      }
      if (firstBoot) {
        firstBoot = false
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(begin, { timeout: 1500 })
        } else {
          setTimeout(begin, 0)
        }
      } else {
        begin()
      }
    }
    const stop = () => {
      if (id != null) { clearInterval(id); id = null }
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    onVis()
    document.addEventListener('visibilitychange', onVis)
    // iOS Safari sometimes only fires `pageshow` on PWA resume (without
    // a fresh visibilitychange) — listen for both.
    window.addEventListener('pageshow', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onVis)
      window.removeEventListener('focus', onVis)
      stop()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Radius change → recompute alerts locally, no network refetch. The API
  // response is always the same fixed bbox (EUROPE_CENTER / 2800 km); radius
  // only drives the client-side `_dist <= radius` filter, so refetching on
  // every slider notch was pure wasted function-invocation. fireEffects=false
  // so widening the range updates the UI without buzzing for planes that were
  // already on screen.
  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return }
    applyInRangeRef.current(aircraftRef.current, false)
  }, [radius]) // eslint-disable-line react-hooks/exhaustive-deps

  // U4: deep link via URL hash — #hex=48da46 selects the aircraft on load
  // and the hash updates as the user selects/deselects so the page can be
  // shared or bookmarked.
  useEffect(() => {
    const m = window.location.hash.match(/[#?&]hex=([a-f0-9]{6})/i)
    if (m) setSelectedHex(m[1].toLowerCase())
  }, [])

  // Tapping a push notification while the app is already open: the service
  // worker posts the hex here (a hash change alone wouldn't re-fire the
  // on-load effect above).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = e => {
      const d = e.data
      if (d?.type === 'select-hex' && /^[a-f0-9]{6}$/i.test(d.hex || '')) {
        setSelectedHex(d.hex.toLowerCase())
        setActivePanel(null)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    if (selectedHex && !selectedHex.startsWith('__')) {
      const desired = `#hex=${selectedHex}`
      if (window.location.hash !== desired) {
        try { window.history.replaceState(null, '', desired) } catch {}
      }
    } else if (window.location.hash.includes('hex=')) {
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search) } catch {}
    }
  }, [selectedHex])

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

  // T4: refresh server trail periodically while an aircraft is selected,
  // so server-side cron updates are picked up without a re-click
  useEffect(() => {
    if (!selectedHex || selectedHex.startsWith('__')) return
    const ctrl = new AbortController()
    const fetchTrail = async () => {
      try {
        const r = await fetch(`/.netlify/functions/aircraft?hex=${selectedHex}`, { signal: ctrl.signal })
        const { trail, sources } = await r.json()
        if (ctrl.signal.aborted) return
        if (sources) {
          setTrailSources(prev => { const next = new Map(prev); next.set(selectedHex, sources); return next })
        }
        if (trail?.length) {
          setServerTrails(prev => { const next = new Map(prev); next.set(selectedHex, trail); return next })
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.debug('[trail] fetch failed', err.message)
      }
    }
    fetchTrail()
    // Server collector cron updates the trail every 2 min, so polling
    // faster than that just spends Netlify-function quota on identical
    // responses. 120 s lines up with the cron cycle.
    const id = setInterval(fetchTrail, 120_000)
    return () => { ctrl.abort(); clearInterval(id) }
  }, [selectedHex])

  function togglePanel(name) {
    setActivePanel(p => p === name ? null : name)
  }

  // B3: memoize gpsCenter so RadarMap props are stable
  const gpsCenter = useMemo(
    () => location ? [location.lat, location.lon] : null,
    [location?.lat, location?.lon]
  )

  const selectedAc = useMemo(
    () => selectedHex ? (aircraft.find(ac => ac.hex === selectedHex) || null) : null,
    [aircraft, selectedHex]
  )

  // Filtr kategorii — mapa pokazuje tylko włączone typy. Zaznaczony samolot
  // zostaje widoczny, nawet gdy jego kategoria jest wyłączona (żeby nie znikał
  // panel informacyjny po przełączeniu filtra).
  const visibleAircraft = useMemo(
    () => aircraft.filter(ac => kinds[ac.kind || 'mil'] || ac.hex === selectedHex),
    [aircraft, kinds, selectedHex]
  )

  // U12: meta theme-color flips red when an emergency squawk is currently
  // visible — gives the iOS Safari status bar / Android Chrome chrome a
  // visceral "something is wrong" cue without forcing a notification.
  const EMERGENCY_SQUAWKS = useMemo(() => new Set(['7500', '7600', '7700', '7400']), [])
  const hasEmergency = useMemo(() => alerts.some(a => {
    const sq = a.ac.squawk ? String(a.ac.squawk).padStart(4, '0') : null
    return sq && EMERGENCY_SQUAWKS.has(sq)
  }), [alerts, EMERGENCY_SQUAWKS])
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    meta.setAttribute('content', hasEmergency ? '#a01818' : '#0a1628')
  }, [hasEmergency])

  async function handleTestPush() {
    if (testPushTimerRef.current) clearTimeout(testPushTimerRef.current)
    setTestPushStatus({ kind: 'loading' })
    const res = await sendTestPush()
    if (res.ok) setTestPushStatus({ kind: 'ok' })
    else setTestPushStatus({ kind: 'err', detail: res.error })
    testPushTimerRef.current = setTimeout(() => {
      setTestPushStatus(null)
      testPushTimerRef.current = null
    }, 6000)
  }

  const handleSelect = useCallback(hex => {
    setSelectedHex(prev => prev === hex ? null : hex)
    if (hex) setActivePanel(null)
  }, [])

  // 3× tap on the version footer reveals debug sections (test push, server
  // position, server diagnostics). Resets after 1.5 s of inactivity.
  function bumpVersionTap() {
    if (debugUnlocked) return
    const ref = versionTapsRef.current
    ref.count++
    if (ref.timer) clearTimeout(ref.timer)
    if (ref.count >= 3) {
      ref.count = 0
      setDebugUnlocked(true)
      return
    }
    ref.timer = setTimeout(() => { ref.count = 0 }, 1500)
  }

  return (
    <div className={`app${activePanel ? ' panel-open' : ''}${selectedAc ? ' info-open' : ''}`}>
      <RadarMap
        aircraft={visibleAircraft}
        hasFetched={hasFetched}
        trails={trailsRef}
        serverTrails={serverTrails}
        center={center}
        gpsCenter={gpsCenter}
        radius={location ? radius : null}
        selectedHex={selectedHex}
        onSelect={handleSelect}
        activeTileId={activeTileId}
        showBases={showBases}
      />

      {/* Version — bottom left */}
      <div className="map-overlay-count">
        <span className="count-version">v{version}</span>
      </div>

      {/* Logo — top left */}
      <div className="map-logo">
        <span className="map-logo-icon">◎</span>
        <span className="map-logo-name">{t('APP_TITLE')}</span>
        {isLoading && <span className="map-logo-spinner">◌</span>}
        {error && !isLoading && <span className="map-logo-error" title={error}>!</span>}
        {lastUpdated && !isLoading && !error && <span className="map-logo-ts">{lastUpdated}</span>}
      </div>

      {/* Aircraft info panel — left, below logo */}
      {selectedAc && (
        <AircraftInfoPanel
          key={selectedAc.hex}
          ac={selectedAc}
          trailSources={trailSources.get(selectedHex)}
          firstSeen={firstSeenRef.current.get(selectedHex)}
          onClose={() => setSelectedHex(null)}
        />
      )}

      {/* Control buttons — top right */}
      <div className="map-ctrl-btns">
        <button className={`map-ctrl-btn ${activePanel === 'ustawienia' ? 'active' : ''}`}
          aria-expanded={activePanel === 'ustawienia'}
          onClick={() => togglePanel('ustawienia')}>{t('NAV_SETTINGS')}</button>
        <button className={`map-ctrl-btn ${activePanel === 'mapy' ? 'active' : ''}`}
          aria-expanded={activePanel === 'mapy'}
          onClick={() => togglePanel('mapy')}>{t('NAV_MAPS')}</button>
      </div>

      {/* Alert toasts — persistent until aircraft leaves range or user dismisses */}
      {alerts.length > 0 && (
        <div className="alert-stack">
          {alerts.slice(0, 3).map(({ hex, ac, dist }) => {
            const openAircraft = () => {
              if (hex.startsWith('__')) return
              setSelectedHex(ac.hex)
              setActivePanel(null)
            }
            return (
            <div key={hex} className="alert-toast"
              role="button"
              tabIndex={0}
              onClick={openAircraft}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAircraft() }
              }}>
              <div className="alert-toast-body">
                <span className="alert-toast-tag">
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                    marginRight: 5, verticalAlign: 'middle',
                    background: ac.kind === 'heli' ? '#00d9ff' : ac.kind === 'heavy' ? '#ffb300' : '#00ff88',
                  }} />
                  {ac.kind === 'heli' ? t('FILTER_HELI') : ac.kind === 'heavy' ? t('FILTER_HEAVY') : t('ALERT_TAG')}
                </span>
                <span className="alert-toast-call">{ac.flight?.trim() || ac.hex}</span>
                <span className="alert-toast-detail">{ac.t || '?'} · {Math.round(dist)} km</span>
              </div>
              <button className="alert-toast-close"
                aria-label={t('DISMISS_NOTIFICATION')}
                onClick={e => {
                  e.stopPropagation()
                  if (!hex.startsWith('__')) {
                    dismissedAlertsRef.current.add(hex)
                    persistDismissed(dismissedAlertsRef.current)
                  }
                  setAlerts(prev => prev.filter(a => a.hex !== hex))
                }}>✕</button>
            </div>
            )
          })}
          {alerts.length > 3 && (
            <div className="alert-toast-overflow">+{alerts.length - 3} {t('ALERT_OVERFLOW')}</div>
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
              {activePanel === 'ustawienia' && t('PANEL_SETTINGS')}
              {activePanel === 'mapy' && t('PANEL_MAPS')}
            </span>
            <button className="side-panel-close" onClick={() => setActivePanel(null)} aria-label={t('CLOSE_PANEL')}>✕</button>
          </div>

          {activePanel === 'ustawienia' && (
            <SettingsPanel
              location={location}
              accuracy={accuracy}
              locationError={locationError}
              requestLocation={requestLocation}
              radius={radius}
              setRadius={setRadius}
              inRangeCount={inRangeCount}
              alertsCount={alerts.length}
              kinds={kinds}
              setKinds={setKinds}
              permissionState={permissionState}
              isSubscribed={isSubscribed}
              isSubscribing={isSubscribing}
              subscribe={subscribe}
              unsubscribe={unsubscribe}
              subscribeError={subscribeError}
              soundOn={soundOn}
              setSoundOn={setSoundOn}
              vibrateOn={vibrateOn}
              setVibrateOn={setVibrateOn}
              error={error}
              debugUnlocked={debugUnlocked}
              fetchData={fetchData}
              handleTestPush={handleTestPush}
              testPushStatus={testPushStatus}
              syncError={syncError}
              serverStatus={serverStatus}
              version={version}
              bumpVersionTap={bumpVersionTap}
            />
          )}

          {activePanel === 'mapy' && (
            <MapsPanel
              activeTileId={activeTileId}
              setActiveTileId={setActiveTileId}
              showBases={showBases}
              setShowBases={setShowBases}
            />
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
// Keep at most this many dismissed hexes in localStorage — Set preserves
// insertion order, so we trim to the most-recent N to bound storage growth
// across long-running sessions.
const DISMISSED_LIST_CAP = 100

function persistDismissed(set) {
  try {
    const arr = [...set].filter(h => !h.startsWith('__')).slice(-DISMISSED_LIST_CAP)
    localStorage.setItem('radar.dismissed', JSON.stringify(arr))
  } catch {}
}

// Singleton AudioContext — browsers limit how many can be open. Reuse one
// across all alerts; create a new oscillator each ping. After long suspends
// some browsers move the ctx to `closed`, in which case we lazily replace it.
let alertCtx = null
function playAlertSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!alertCtx || alertCtx.state === 'closed') alertCtx = new AC()
    if (alertCtx.state === 'suspended') alertCtx.resume().catch(() => {})
    const osc = alertCtx.createOscillator()
    const gain = alertCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, alertCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, alertCtx.currentTime + 0.35)
    osc.connect(gain).connect(alertCtx.destination)
    osc.start()
    osc.stop(alertCtx.currentTime + 0.4)
  } catch {}
}

const NOTIF_CLOSE_RANGE_KM = 10
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
function compassDir(track) {
  if (track == null) return null
  return COMPASS[Math.round(track / 45) % 8]
}

function triggerNotification(ac, dist) {
  if (!('serviceWorker' in navigator)) return
  if (Notification.permission !== 'granted') {
    console.debug('[notify] skipped: permission =', Notification.permission)
    return
  }
  // Match the server-side wording: a closer plane gets the urgent title and
  // a richer line (distance, flight level, heading).
  const near = dist <= NOTIF_CLOSE_RANGE_KM
  const parts = [`${Math.round(dist)} km`]
  if (ac.alt_baro != null) parts.push(`FL${Math.round(ac.alt_baro / 100)}`)
  const c = compassDir(ac.track)
  if (c) parts.push(`kurs ${c}`)
  const label = `${ac.flight?.trim() || ac.hex} (${ac.t || t('NOTIF_UNKNOWN_TYPE')})`

  // Tytuł zależny od kategorii (wojsko rozróżnia dodatkowo „blisko").
  const title =
    ac.kind === 'heavy' ? t('NOTIF_TITLE_HEAVY')
    : ac.kind === 'heli' ? t('NOTIF_TITLE_HELI')
    : near ? t('NOTIF_TITLE_NEAR') : t('NOTIF_TITLE')

  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification(title, {
      body: `${label} — ${parts.join(', ')}`,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // Per-hex tag + renotify=true: if the same aircraft re-enters the
      // radar, iOS shows a new notification instead of silently replacing
      // the old (and missed) one. Tag MUSI być spójny z serwerowym push
      // (push-handler.js → data.tag = ac.hex), żeby ewentualny dublet
      // klient+serwer został przez iOS scalony, a nie pokazany dwa razy.
      tag: ac.hex,
      renotify: true,
      data: { hex: ac.hex },
      actions: [{ action: 'show', title: t('NOTIF_SHOW') }],
    })
  })
}
