import { useState, useEffect, useCallback, useRef } from 'react'
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
  const [alertedHex, setAlertedHex] = useState(new Set())
  const [selectedHex, setSelectedHex] = useState(null)

  const { location, locationError, requestLocation } = useGeolocation()
  const { isSubscribed, subscribe, permissionState } = usePushNotifications()
  const pollRef = useRef(null)

  const center = mode === 'poland' ? POLAND_CENTER : (location ? [location.lat, location.lon] : POLAND_CENTER)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { aircraft: data, source, isDemo } = await fetchMilitaryAircraft(center, mode === 'poland' ? 800 : radius)
      setAircraft(data)
      setDataSource(isDemo ? 'demo' : source)
      setLastUpdate(new Date())

      if (mode === 'gps' && location) {
        data.forEach(ac => {
          if (!alertedHex.has(ac.hex)) {
            const dist = haversine(location.lat, location.lon, ac.lat, ac.lon)
            if (dist <= radius) {
              triggerNotification(ac, dist)
              setAlertedHex(prev => new Set(prev).add(ac.hex))
            }
          }
        })
      }

      const currentHexes = new Set(data.map(a => a.hex))
      setAlertedHex(prev => {
        const next = new Set(prev)
        for (const h of prev) if (!currentHexes.has(h)) next.delete(h)
        return next
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [center, radius, mode, location, alertedHex])

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
