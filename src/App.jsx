import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import RadarMap from './components/RadarMap'
import ControlPanel from './components/ControlPanel'
import AircraftList from './components/AircraftList'
import StatusBar from './components/StatusBar'
import { useGeolocation } from './hooks/useGeolocation'
import { usePushNotifications } from './hooks/usePushNotifications'
import { fetchMilitaryAircraft } from './api'
import './App.css'

const POLAND_CENTER = [52.0, 19.5]
const POLL_INTERVAL = 60_000

export default function App() {
  const [aircraft, setAircraft] = useState([])
  const [lastUpdate, setLastUpdate] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dataSource, setDataSource] = useState(null)
  const [mode, setMode] = useState('gps')
  const [radius, setRadius] = useState(100)
  const [selectedHex, setSelectedHex] = useState(null)

  // Bug 1 fix: use ref so alertedHex mutations don't recreate fetchData
  const alertedHexRef = useRef(new Set())

  const { location, locationError, requestLocation } = useGeolocation()
  const { isSubscribed, subscribe, permissionState } = usePushNotifications()
  const pollRef = useRef(null)

  // Bug 1 fix: memoize center by value so array identity stays stable
  const center = useMemo(
    () => mode === 'poland' ? POLAND_CENTER : (location ? [location.lat, location.lon] : POLAND_CENTER),
    [mode, location?.lat, location?.lon]
  )

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { aircraft: data, source, isDemo } = await fetchMilitaryAircraft(
        center,
        mode === 'poland' ? 800 : radius
      )

      // Bug 3 fix: mark aircraft within radius
      const enriched = data.map(ac => {
        if (mode === 'gps' && location) {
          const dist = haversine(location.lat, location.lon, ac.lat, ac.lon)
          return { ...ac, _inRadius: dist <= radius, _dist: dist }
        }
        return ac
      })

      setAircraft(enriched)
      setDataSource(isDemo ? 'demo' : source)
      setLastUpdate(new Date())

      // Bug 4 fix: clear selectedHex if that aircraft is no longer visible
      const currentHexes = new Set(data.map(a => a.hex))
      setSelectedHex(prev => (prev && !currentHexes.has(prev) ? null : prev))

      // Bug 1 fix: mutate ref instead of setState — no re-render, no loop
      if (mode === 'gps' && location) {
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
  }, [center, radius, mode, location]) // no alertedHex in deps — Bug 1 fix

  useEffect(() => {
    fetchData()
    pollRef.current = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [fetchData])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="radar-icon">◎</span>
          <span className="brand-name">MILITARY RADAR</span>
          <span className="brand-sub">PL</span>
        </div>
        <StatusBar
          lastUpdate={lastUpdate}
          isLoading={isLoading}
          error={error}
          count={aircraft.length}
          source={dataSource}
        />
      </header>

      <main className="app-body">
        <RadarMap
          aircraft={aircraft}
          center={center}
          radius={mode === 'gps' ? radius : null}
          mode={mode}
          selectedHex={selectedHex}
          onSelect={setSelectedHex}
        />

        <aside className="sidebar">
          <ControlPanel
            mode={mode}
            setMode={setMode}
            radius={radius}
            setRadius={setRadius}
            location={location}
            locationError={locationError}
            requestLocation={requestLocation}
            isSubscribed={isSubscribed}
            subscribe={subscribe}
            permissionState={permissionState}
            onRefresh={fetchData}
          />
          <AircraftList
            aircraft={aircraft}
            userLocation={location}
            selectedHex={selectedHex}
            onSelect={setSelectedHex}
          />
        </aside>
      </main>
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
