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
  const [filteredAircraft, setFilteredAircraft] = useState([])
  const [lastUpdate, setLastUpdate] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('gps') // 'gps' | 'poland'
  const [radius, setRadius] = useState(100)
  const [typeFilter, setTypeFilter] = useState('all')
  const [alertedHex, setAlertedHex] = useState(new Set())

  const { location, locationError, requestLocation } = useGeolocation()
  const { isSubscribed, subscribe, permissionState } = usePushNotifications()
  const pollRef = useRef(null)

  const center = mode === 'poland' ? POLAND_CENTER : (location ? [location.lat, location.lon] : POLAND_CENTER)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchMilitaryAircraft(center, mode === 'poland' ? 800 : radius)
      setAircraft(data)
      setLastUpdate(new Date())

      // powiadomienia dla nowych samolotów w zasięgu
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

      // usuń samoloty które wyszły z zasięgu z listy alertowanych
      const currentHexes = new Set(data.map(a => a.hex))
      setAlertedHex(prev => {
        const next = new Set(prev)
        for (const h of prev) {
          if (!currentHexes.has(h)) next.delete(h)
        }
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

  // filtrowanie po typie
  useEffect(() => {
    if (typeFilter === 'all') {
      setFilteredAircraft(aircraft)
    } else {
      setFilteredAircraft(aircraft.filter(ac => matchesTypeFilter(ac, typeFilter)))
    }
  }, [aircraft, typeFilter])

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
          count={filteredAircraft.length}
        />
      </header>

      <main className="app-body">
        <RadarMap
          aircraft={filteredAircraft}
          center={center}
          radius={mode === 'gps' ? radius : null}
          mode={mode}
        />

        <aside className="sidebar">
          <ControlPanel
            mode={mode}
            setMode={setMode}
            radius={radius}
            setRadius={setRadius}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            location={location}
            locationError={locationError}
            requestLocation={requestLocation}
            isSubscribed={isSubscribed}
            subscribe={subscribe}
            permissionState={permissionState}
            onRefresh={fetchData}
          />
          <AircraftList aircraft={filteredAircraft} userLocation={location} />
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

function matchesTypeFilter(ac, filter) {
  const t = (ac.t || '').toUpperCase()
  const desc = (ac.desc || '').toUpperCase()
  switch (filter) {
    case 'fighter': return /F-?16|F-?35|MIG|SU-|TYPHOON|RAFALE|JAS/.test(t + desc)
    case 'transport': return /C-?130|C-?17|C-?5|AN-?|IL-?|CASA/.test(t + desc)
    case 'helicopter': return /H-?60|UH-|AH-|CH-|MI-|W-?3|HELO|ROTOR/.test(t + desc)
    case 'tanker': return /KC-|A330|MRTT|TANKER/.test(t + desc)
    case 'patrol': return /P-?8|P-?3|ORION|POSEIDON|AWACS|E-?3|SENTINEL/.test(t + desc)
    default: return true
  }
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
