import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import RadarMap from './components/RadarMap'
import { MapMark, MapPanelButtons } from './components/MapChrome'
import AircraftInfoPanel from './components/AircraftInfoPanel'
// Panele otwiera się rzadko, a ważą swoje — niech dojdą przy pierwszym
// otwarciu, a nie przy starcie aplikacji.
const AlertsPanel = lazy(() => import('./components/AlertsPanel'))
const DayPlanPanel = lazy(() => import('./components/DayPlanPanel'))
import PanelFooter from './components/PanelFooter'
import AlertStack from './components/AlertStack'
import { IconClose } from './components/UiIcons'
const MapsPanel = lazy(() => import('./components/MapsPanel'))
const ArrivalsPanel = lazy(() => import('./components/ArrivalsPanel'))
import { useGeolocation } from './hooks/useGeolocation'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useAirspace } from './hooks/useAirspace'
import { useNotams } from './hooks/useNotams'
import { useInbound } from './hooks/useInbound'
import { usePolling } from './hooks/usePolling'
import { useHexDeepLink } from './hooks/useHexDeepLink'
import { useUsagePing } from './hooks/useUsagePing'
import { useCompass } from './hooks/useCompass'
import { fetchMilitaryAircraft } from './api'
import { haversine, bearing } from './lib/geo'
import { alertsLevel, kindsOnCount } from './lib/alertsState'
import { ARRIVAL_AIRPORTS, mergeArrivals } from './lib/inbound'
import { updateClientTrails } from './lib/clientTrails'
import { loadDismissed, persistDismissed, playAlertSound, triggerNotification } from './lib/localAlert'
import { t } from './i18n'
import { version } from '../package.json'
import './App.css'

const EUROPE_CENTER = [52.0, 15.0]
// Co 10 s, nie co 5 s: każde odświeżenie to wywołanie funkcji `aircraft`
// (kredyty Netlify), a ikony i tak przesuwają się płynnie (animacja w RadarMap).
const POLL_INTERVAL = 10_000
const SELECTION_GRACE_CYCLES = 2
// Przyciemniona czerwień alarmowa — pasek stanu systemu ma sygnalizować, nie
// świecić. Wyprowadzona z --alert, żeby nie była szóstym odcieniem czerwieni.
const EMERGENCY_THEME_COLOR = '#8a2028'
const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700', '7400'])

export default function App() {
  const [aircraft, setAircraft] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [error, setError] = useState(null)
  const [radius, setRadius] = useLocalStorage('radar.radius', 100)
  const [kinds, setKinds] = useLocalStorage('radar.kinds', { mil: true, heli: true, heavy: true, rare: true })
  const [soundOn, setSoundOn] = useLocalStorage('radar.sound', true)
  const [vibrateOn, setVibrateOn] = useLocalStorage('radar.vibrate', true)
  const [selectedHex, setSelectedHex] = useState(null)
  // Maszyna, do której mapa ma dolecieć: TYLKO wybór spoza mapy (link #hex,
  // kliknięte powiadomienie). Kliknięcie ikony na mapie nigdy nie przesuwa
  // widoku — użytkownik patrzy tam, gdzie chce patrzeć.
  const [focusHex, setFocusHex] = useState(null)
  // Śledzenie: mapa podąża za zaznaczoną maszyną, dopóki ta nie wyląduje albo
  // nie zniknie z radaru. Zawsze dotyczy zaznaczonej — zmiana albo zamknięcie
  // karty kończy śledzenie.
  const [followHex, setFollowHex] = useState(null)
  const [followNotice, setFollowNotice] = useState(null)
  const [serverTrails, setServerTrails] = useState(new Map())
  const [activePanel, setActivePanel] = useState(null)
  const [planFocus, setPlanFocus] = useState(null)
  const [showBases, setShowBases] = useLocalStorage('radar.bases', true)
  const [showNatoBases, setShowNatoBases] = useLocalStorage('radar.natoBases', true)
  const [showRanges, setShowRanges] = useLocalStorage('radar.ranges', true)
  const [showAirspace, setShowAirspace] = useLocalStorage('radar.airspace', true)
  // Plan PAŻP zasila też dymek polskiej bazy („co dziś stąd lata”), więc
  // pobieramy go, gdy włączona jest którakolwiek z tych warstw.
  const airspace = useAirspace(showAirspace || showBases || activePanel === 'plan')
  const notams = useNotams(activePanel === 'plan')
  // Jumbo jety i An-124 z celem w Rzeszowie albo Krakowie — osobno dla każdego
  // lotniska, bo maszyna bywa widoczna na godziny przed wejściem w nasz obszar.
  const [arrivals, setArrivals] = useLocalStorage('radar.arrivals', { EPRZ: true, EPKK: true })
  // Panel Przyloty pokazuje oba lotniska także przy wyłączonych przełącznikach
  // (te sterują powiadomieniami i znacznikami na mapie). Maszyna wybrana
  // z tej listy musi zostać w danych po zamknięciu panelu — inaczej przy
  // wyłączonych lotniskach lista się czyściła i karta się nie otwierała.
  const arrivalPickRef = useRef(null)
  const inboundRaw = useInbound(ARRIVAL_AIRPORTS.some(a => arrivals[a.icao] !== false) ||
    activePanel === 'przyloty' || (selectedHex != null && arrivalPickRef.current === selectedHex))
  const inboundHexesRef = useRef(new Set())
  useEffect(() => {
    inboundHexesRef.current = new Set(inboundRaw.map(x => x.hex))
  }, [inboundRaw])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [inRangeCount, setInRangeCount] = useState(0)
  const [debugUnlocked, setDebugUnlocked] = useState(() => {
    try { return new URLSearchParams(window.location.search).has('debug') } catch { return false }
  })
  const [debugOpen, setDebugOpen] = useState(false)
  const versionTapsRef = useRef({ count: 0, timer: null })
  // Powrót do widoku startowego wystawia RadarMap (tam mieszka instancja
  // Leafletu), a wywołuje go dotknięcie znacznika aplikacji (MapChrome).
  const recenterRef = useRef(null)

  // Ref tak, aby fetchData (zależne tylko od location) widziało aktualne
  // filtry bez przepinania interwału przy każdym przełączeniu kategorii.
  const kindsRef = useRef(kinds)
  kindsRef.current = kinds

  const alertedHexRef = useRef(new Set())
  const dismissedAlertsRef = useRef(new Set(loadDismissed()))
  const selectionMissCountRef = useRef(0)
  const trailsRef = useRef(new Map())
  const isMountedRef = useRef(false)
  const fetchAbortRef = useRef(null)
  const { location, requestLocation } = useGeolocation()
  // Kierunek telefonu do stożka przy Twojej pozycji na mapie. Włączany
  // w Powiadomieniach (tam też, na iOS, pada prośba o zgodę).
  const compass = useCompass()
  const [compassOn, setCompassOn] = useLocalStorage('radar.compass', true)
  const {
    isSubscribed, subResolved, isSubscribing, subscribe, unsubscribe,
    permissionState, subscribeError,
  } = usePushNotifications(location, radius, kinds, arrivals)

  // Anonimowy licznik użytkowników — raz na dobę, gdy znamy już stan pusha.
  useUsagePing(subResolved, isSubscribed)

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
      const { aircraft: data, isDemo, source } = await fetchMilitaryAircraft(EUROPE_CENTER, 2800, ctrl.signal)
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
        if (location) {
          const dist = haversine(location.lat, location.lon, ac.lat, ac.lon)
          const brg = bearing(location.lat, location.lon, ac.lat, ac.lon)
          return { ...ac, _dist: dist, _bearing: brg }
        }
        return ac
      })
      updateClientTrails(trailsRef.current, enriched, now)
      const currentHexes = new Set(enriched.map(a => a.hex))
      setAircraft(enriched)
      setHasFetched(true)
      setLastUpdated(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      // B4: grace period — don't immediately drop selection if aircraft missing for one cycle.
      // Maszyna z celem w Rzeszowie/Krakowie bywa poza naszym obszarem przez
      // większość lotu (747 nad Atlantykiem), więc jej zaznaczenie musi
      // przetrwać brak w danych radaru — inaczej karta znikała od razu.
      setSelectedHex(prev => {
        if (!prev || currentHexes.has(prev) || inboundHexesRef.current.has(prev)) {
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
  }, [location, applyInRange])

  usePolling(fetchData, POLL_INTERVAL)

  // Latest aircraft snapshot, so the radius slider can recompute alerts from
  // the data we already have instead of refetching.
  const aircraftRef = useRef(aircraft)
  aircraftRef.current = aircraft

  // Auto-start GPS tracking on mount
  useEffect(() => { requestLocation() }, []) // eslint-disable-line react-hooks/exhaustive-deps



  // Radius change → recompute alerts locally, no network refetch. The API
  // response is always the same fixed bbox (EUROPE_CENTER / 2800 km); radius
  // only drives the client-side `_dist <= radius` filter, so refetching on
  // every slider notch was pure wasted function-invocation. fireEffects=false
  // so widening the range updates the UI without buzzing for planes that were
  // already on screen.
  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return }
    applyInRangeRef.current(aircraftRef.current, false)
  }, [radius])

  // Wybór spoza mapy (link #hex, kliknięte powiadomienie): zaznacz maszynę
  // i dolecieć do niej.
  const openHex = useCallback(hex => {
    setSelectedHex(hex)
    setFocusHex(hex)
    setActivePanel(null)
  }, [])
  useHexDeepLink(selectedHex, openHex)

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
        const { trail } = await r.json()
        if (ctrl.signal.aborted) return
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
  const gpsLat = location?.lat
  const gpsLon = location?.lon
  const gpsCenter = useMemo(
    () => gpsLat != null ? [gpsLat, gpsLon] : null,
    [gpsLat, gpsLon]
  )

  // Maszyny z celem w Rzeszowie/Krakowie (szczegóły w mergeArrivals).
  const aircraftWithArrivals = useMemo(
    () => mergeArrivals(aircraft, inboundRaw, arrivals, selectedHex),
    [aircraft, inboundRaw, arrivals, selectedHex]
  )

  // Stan alertów pokazywany kropką na dzwonku — ta sama reguła, co karta
  // w panelu Alerty.
  const alertsDot = alertsLevel({ hasGps: !!location, pushOn: isSubscribed, kindsOn: kindsOnCount(kinds) })

  const selectedAc = useMemo(
    () => selectedHex ? (aircraftWithArrivals.find(ac => ac.hex === selectedHex) || null) : null,
    [aircraftWithArrivals, selectedHex]
  )

  // Koniec śledzenia: inna maszyna albo zamknięta karta (po cichu), lądowanie
  // albo dwa odświeżenia bez maszyny w danych (z komunikatem). Dwa, nie
  // jedno — pojedynczy brak to zwykle chwilowa dziura w odbiorze.
  const followMissRef = useRef(0)
  const lastFollowNameRef = useRef(null)
  useEffect(() => {
    if (!followHex) return
    const ac = aircraftWithArrivals.find(a => a.hex === followHex)
    if (!ac) {
      // Zaznaczenie znika po tylu samych brakach (SELECTION_GRACE_CYCLES) —
      // wtedy też mówimy, że maszyna zniknęła, a nie kończymy po cichu.
      followMissRef.current++
      if (followMissRef.current >= 2 || selectedHex !== followHex) {
        setFollowHex(null)
        setFollowNotice(`${lastFollowNameRef.current || followHex} ${t('FOLLOW_ENDED_LOST')}`)
      }
      return
    }
    followMissRef.current = 0
    lastFollowNameRef.current = ac.flight?.trim() || followHex
    if (selectedHex !== followHex) { setFollowHex(null); return }
    if (ac.on_ground) {
      setFollowHex(null)
      setFollowNotice(`${lastFollowNameRef.current} ${t('FOLLOW_ENDED_LANDED')}`)
    }
  }, [aircraftWithArrivals, followHex, selectedHex])

  useEffect(() => {
    if (!followNotice) return
    const id = setTimeout(() => setFollowNotice(null), 5000)
    return () => clearTimeout(id)
  }, [followNotice])

  const toggleFollow = useCallback(() => {
    followMissRef.current = 0
    setFollowNotice(null)
    setFollowHex(prev => prev === selectedHex ? null : selectedHex)
  }, [selectedHex])

  // Filtr kategorii — mapa pokazuje tylko włączone typy. Zaznaczony samolot
  // zostaje widoczny, nawet gdy jego kategoria jest wyłączona (żeby nie znikał
  // panel informacyjny po przełączeniu filtra).
  const visibleAircraft = useMemo(
    () => aircraftWithArrivals.filter(ac => kinds[ac.kind || 'mil'] || ac.hex === selectedHex),
    [aircraftWithArrivals, kinds, selectedHex]
  )

  // U12: meta theme-color flips red when an emergency squawk is currently
  // visible — gives the iOS Safari status bar / Android Chrome chrome a
  // visceral "something is wrong" cue without forcing a notification.
  const hasEmergency = useMemo(() => alerts.some(a => {
    const sq = a.ac.squawk ? String(a.ac.squawk).padStart(4, '0') : null
    return sq && EMERGENCY_SQUAWKS.has(sq)
  }), [alerts])
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    // Wartość spoczynkowa musi się zgadzać z <meta theme-color> w index.html,
    // inaczej pasek stanu zmienia odcień w chwili zamontowania aplikacji.
    meta.setAttribute('content', hasEmergency ? EMERGENCY_THEME_COLOR : '#080f1c')
  }, [hasEmergency])


  const handleSelect = useCallback(hex => {
    setSelectedHex(prev => prev === hex ? null : hex)
    // Kliknięcie w mapę albo w maszynę zdejmuje obrys stref z „Planu dnia".
    setPlanFocus(null)
    if (hex) setActivePanel(null)
  }, [])

  // Obrys stref z „Planu dnia" znika razem z panelem. Wyjątek: na telefonie
  // panel zamykamy sami po kliknięciu wiersza, żeby było widać mapę — wtedy
  // obrys zostaje do pierwszego dotknięcia mapy.
  const keepPlanFocusRef = useRef(false)
  useEffect(() => {
    if (activePanel === 'plan') return
    if (keepPlanFocusRef.current) { keepPlanFocusRef.current = false; return }
    setPlanFocus(null)
  }, [activePanel])

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

  const dismissAlert = useCallback(hex => {
    if (!hex.startsWith('__')) {
      dismissedAlertsRef.current.add(hex)
      persistDismissed(dismissedAlertsRef.current)
    }
    setAlerts(prev => prev.filter(a => a.hex !== hex))
  }, [])

  return (
    <div className={`app${activePanel ? ' panel-open' : ''}${selectedAc ? ' info-open' : ''}`}>
      <RadarMap
        aircraft={visibleAircraft}
        hasFetched={hasFetched}
        trails={trailsRef}
        serverTrails={serverTrails}
        center={EUROPE_CENTER}
        gpsCenter={gpsCenter}
        radius={location ? radius : null}
        selectedHex={selectedHex}
        focusHex={focusHex}
        onSelect={handleSelect}
        showBases={showBases}
        showNatoBases={showNatoBases}
        showRanges={showRanges}
        airspace={airspace}
        showAirspace={showAirspace}
        recenterRef={recenterRef}
        planFocus={planFocus}
        followHex={followHex}
        heading={compassOn ? compass.heading : null}
      />

      <MapMark isLoading={isLoading} error={error} lastUpdated={lastUpdated}
        onHome={() => recenterRef.current?.()} />
      <MapPanelButtons
        activePanel={activePanel}
        onTogglePanel={togglePanel}
        alertsLevel={alertsDot}
      />

      {/* Karta maszyny — pływający panel przy lewej krawędzi, pod paskiem
          górnym. Na wąskim ekranie rozciąga się na całą szerokość od góry. */}
      {selectedAc && (
        <AircraftInfoPanel
          key={selectedAc.hex}
          ac={selectedAc}
          onClose={() => setSelectedHex(null)}
          following={followHex === selectedAc.hex}
          onToggleFollow={toggleFollow}
        />
      )}

      {followNotice && <div className="follow-notice" role="status">{followNotice}</div>}

      <AlertStack alerts={alerts} onDismiss={dismissAlert} />

      {/* Side panel backdrop — mobile only (U10) */}
      {activePanel && (
        <div className="side-panel-backdrop" onClick={() => setActivePanel(null)} />
      )}

      {/* Side panels — slide from right */}
      {activePanel && (
        <div className="side-panel">
          <div className="side-panel-header">
            <span className="side-panel-title">
              {activePanel === 'alerty' && t('PANEL_ALERTS')}
              {activePanel === 'mapy' && t('PANEL_MAPS')}
              {activePanel === 'plan' && t('PANEL_PLAN')}
              {activePanel === 'przyloty' && t('PANEL_ARRIVALS')}
            </span>
            <button className="side-panel-close" onClick={() => setActivePanel(null)} aria-label={t('CLOSE_PANEL')}><IconClose size={18} /></button>
          </div>

          <Suspense fallback={<p className="panel-loading">{t('LOADING_PANEL')}</p>}>
          {activePanel === 'alerty' && (
            <AlertsPanel
              location={location}
              onRetryGps={requestLocation}
              compass={compass}
              compassOn={compassOn}
              setCompassOn={setCompassOn}
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
            >
              <PanelFooter
                error={error}
                debugUnlocked={debugUnlocked}
                debugOpen={debugOpen}
                setDebugOpen={setDebugOpen}
                version={version}
                bumpVersionTap={bumpVersionTap}
              />
            </AlertsPanel>
          )}

          {activePanel === 'plan' && (
            <DayPlanPanel
              zones={airspace.zones}
              error={airspace.error}
              now={airspace.now}
              notams={notams}
              focusKey={planFocus?.key}
              onFocus={b => {
                // Ponowne kliknięcie tego samego wiersza zdejmuje obrys.
                if (planFocus?.key === b.key) { setPlanFocus(null); return }
                setPlanFocus({ key: b.key, zones: b.zones, at: Date.now() })
                setSelectedHex(null)
                // Na telefonie panel przykrywa mapę — zamykamy go, żeby było
                // widać strefy. Na szerokim ekranie panel stoi obok mapy.
                if (window.matchMedia('(max-width: 600px)').matches) {
                  keepPlanFocusRef.current = true
                  setActivePanel(null)
                }
              }}
            />
          )}

          {activePanel === 'przyloty' && (
            <ArrivalsPanel inbound={inboundRaw} arrivals={arrivals} setArrivals={setArrivals}
              onOpen={hex => { arrivalPickRef.current = hex; openHex(hex) }} />
          )}

          {activePanel === 'mapy' && (
            <MapsPanel
              showBases={showBases}
              setShowBases={setShowBases}
              showNatoBases={showNatoBases}
              setShowNatoBases={setShowNatoBases}
              showRanges={showRanges}
              setShowRanges={setShowRanges}
              showAirspace={showAirspace}
              setShowAirspace={setShowAirspace}
              airspaceError={airspace.error}
              kinds={kinds}
              setKinds={setKinds}
            />
          )}
          </Suspense>

        </div>
      )}
    </div>
  )
}
