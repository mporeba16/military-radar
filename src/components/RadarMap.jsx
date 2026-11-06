import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './RadarMap.css'
import { MIL_BASES_PL, MIL_BASES_NATO, mapLabel } from '../airfields'
import { BASE_PL, BASE_NATO } from '../lib/palette'
import AirspaceLayer from './AirspaceLayer'
import { basePopupHtml } from './basePopup'
import MilRangesLayer, { MilRangeHatchDefs, HatchedPolygon, AREA_LABEL_ZOOM } from './MilRangesLayer'
import { MIL_AIRFIELD_AREAS } from '../data/milAirfieldAreas'
import { t } from '../i18n'
import { buildTrailSegments } from '../lib/trailSegments'
import AircraftLayer, { iconScaleForZoom } from './AircraftLayer'
import { BASE_TILE } from '../lib/tiles'

function MapClickHandler({ onSelect }) {
  useMapEvents({ click: () => onSelect(null) })
  return null
}

// Statyczna warstwa polskich baz wojskowych (Łask, Krzesiny…). Rysowana POD
// samolotami (zIndexOffset ujemny). Nazwa pokazuje się od tego samego
// przybliżenia co nazwy poligonów (AREA_LABEL_ZOOM).

// Jedna warstwa, dwa zbiory: polskie bazy i bazy NATO. `variant` decyduje
// tylko o kolorze etykiety — reszta zachowania jest wspólna, żeby obie warstwy
// nie zaczęły żyć własnym życiem. Bazę na mapie znaczy kreskowany teren
// (BaseAreasLayer); marker niesie już tylko podpis i dymek z nazwą.
// Kliknięcie w bazę (podpis albo środek terenu) otwiera dymek: plan PAŻP na
// dziś i maszyny w pobliżu. Dane czyta z `infoRef` w chwili otwarcia, żeby
// odświeżanie samolotów co 10 s nie przebudowywało markerów baz.
const POPUP_PAD = { autoPanPaddingTopLeft: [16, 64], autoPanPaddingBottomRight: [72, 24] }

function BasesLayer({ zoom, bases, variant, infoRef }) {
  const map = useMap()
  const groupRef = useRef(null)

  useEffect(() => {
    const group = L.layerGroup()
    map.addLayer(group)
    groupRef.current = group
    return () => { map.removeLayer(group); groupRef.current = null }
  }, [map])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clearLayers()
    const showLabel = zoom >= AREA_LABEL_ZOOM
    const labelMod = variant === 'nato' ? ' base-marker-label--nato' : ''
    for (const ap of bases) {
      const label = showLabel
        // Sama nazwa — kod ICAO (EPLK przy Łasku) tylko zaśmiecał mapę
        // (decyzja użytkownika 20.10.2026); zostaje w dymku po kliknięciu.
        ? `<span class="base-marker-label${labelMod}">${mapLabel(ap)}</span>`
        : ''
      const icon = L.divIcon({
        className: 'base-marker',
        html: label,
        // Niewidoczny cel dla palca w środku lotniska — przy oddaleniu, gdy
        // podpisu jeszcze nie ma, to jedyne miejsce do kliknięcia.
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })
      const m = L.marker([ap.lat, ap.lon], { icon, zIndexOffset: -1000, keyboard: false })
      m.bindTooltip(ap.name, { direction: 'top', offset: [0, -8], className: `base-tooltip base-tooltip--${variant}` })
      m.bindPopup(() => basePopupHtml(ap, variant, { ...infoRef.current, now: Date.now() }), {
        className: `base-popup base-popup--${variant}`, closeButton: false, ...POPUP_PAD,
      })
      m.on('popupopen', () => m.closeTooltip())
      group.addLayer(m)
    }
  }, [zoom, bases, variant, infoRef, map])

  return null
}

// Teren lotniska — kreskowany obrys jak poligon. To jedyny znak bazy na mapie:
// kwadraty nad nim zaśmiecały widok całej Polski.
function BaseAreasLayer({ bases, variant }) {
  const className = `base-area--${variant}`
  const color = variant === 'nato' ? BASE_NATO : BASE_PL
  return bases.flatMap(ap =>
    (MIL_AIRFIELD_AREAS[ap.icao] || []).map((ring, i) => (
      <HatchedPolygon key={`${ap.icao}-${i}`} positions={ring} className={className} color={color}
        weight={2.2} />
    ))
  )
}

function TileFilter({ filter }) {
  const map = useMap()
  useEffect(() => {
    map.getPanes().tilePane.style.filter = filter || ''
  }, [filter, map])
  return null
}

// Wybór maszyny spoza mapy — link z #hex albo kliknięte powiadomienie —
// otwierał kartę, ale mapa zostawała, gdzie była, i nie było widać, gdzie ta
// maszyna leci. Przesuwamy mapę raz na taki wybór i tylko wtedy, gdy maszyna
// jest poza widokiem.
//
// Kliknięcie ikony NA MAPIE nie trafia tutaj (App ustawia `focusHex` tylko dla
// wyboru spoza mapy) — wcześniej trafiało i mapa potrafiła nagle skoczyć pod
// kliknięty samolot.
//
// Przy linku lista maszyn przychodzi dopiero po chwili, więc czekamy, aż
// wybrana się w niej pojawi.
function SelectionFocus({ aircraft, selectedHex }) {
  const map = useMap()
  const doneRef = useRef(null)

  useEffect(() => {
    if (!selectedHex) { doneRef.current = null; return }
    if (doneRef.current === selectedHex) return
    const ac = aircraft.find(a => a.hex === selectedHex)
    if (!ac || ac.lat == null || ac.lon == null) return
    doneRef.current = selectedHex
    if (!map.getBounds().pad(-0.1).contains([ac.lat, ac.lon])) {
      map.flyTo([ac.lat, ac.lon], Math.max(map.getZoom(), 7), { duration: 0.8 })
    }
  }, [aircraft, selectedHex, map])

  return null
}

// Twoja pozycja jak w Google Maps: kropka (w kolorze okręgu zasięgu alertów,
// żeby było jasne, że to środek tego okręgu), a gdy telefon ma
// kompas — stożek w kierunku, w który patrzysz, obracany razem z telefonem.
// Stożek mówi, w którą stronę się obrócić, żeby zobaczyć samolot.
// Marker powstaje raz; pozycja i obrót zmieniają się bez przebudowy ikony
// (kompas potrafi podawać kilkanaście odczytów na sekundę). Klikalna jest
// tylko kropka — stożek nie zasłania samolotów pod spodem. Na iOS kompas
// wymaga zgody, o którą wolno poprosić dopiero po dotknięciu: kropka ma
// wtedy plakietkę, a dotknięcie prosi o zgodę.
const ME_HTML = `
  <div class="me">
    <svg class="me__cone" viewBox="-60 -60 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="meConeGrad" cx="0" cy="0" r="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#00ff88" stop-opacity="0.6"/>
          <stop offset="1" stop-color="#00ff88" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <path d="M0 0 L-29 -50.2 A58 58 0 0 1 29 -50.2 Z" fill="url(#meConeGrad)"/>
    </svg>
    <span class="me__pulse"></span>
    <span class="me__dot"></span>
    <span class="me__hint" title="Dotknij, aby włączyć kompas">N</span>
  </div>`

function UserLocation({ position, heading, compassState, onCompassRequest }) {
  const map = useMap()
  const markerRef = useRef(null)
  const requestRef = useRef(onCompassRequest)
  requestRef.current = onCompassRequest

  useEffect(() => {
    if (!position) return
    const marker = L.marker(position, {
      icon: L.divIcon({ html: ME_HTML, className: 'me-marker', iconSize: [120, 120], iconAnchor: [60, 60] }),
      zIndexOffset: -500,
      keyboard: false,
    })
    marker.on('click', e => {
      if (e.originalEvent) e.originalEvent.stopPropagation()
      requestRef.current?.()
    })
    marker.addTo(map)
    markerRef.current = marker
    return () => { map.removeLayer(marker); markerRef.current = null }
    // Pozycja aktualizowana niżej, bez przebudowy markera.
  }, [map, !!position]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (position) markerRef.current?.setLatLng(position)
  }, [position])

  useEffect(() => {
    const el = markerRef.current?.getElement()
    if (!el) return
    const cone = el.querySelector('.me__cone')
    cone.style.display = heading == null ? 'none' : ''
    if (heading != null) cone.style.transform = `rotate(${heading}deg)`
    el.querySelector('.me__hint').style.display = compassState === 'needs-permission' ? '' : 'none'
  }, [heading, compassState, position])

  return null
}

// Śledzenie maszyny: przy włączeniu dolot do niej (z przybliżeniem do
// FOLLOW_MIN_ZOOM, jeśli widok był szerszy), potem przy każdym odświeżeniu
// przesunięcie mapy za nową pozycją. Przesunięcie trwa mniej więcej tyle, co
// animacja ikony (AircraftLayer), więc samolot zostaje w środku ekranu.
// Przybliżanie i oddalanie działa normalnie; przesunięcie palcem wytrzyma
// do następnego odświeżenia — śledzenie wyłącza się przyciskiem na karcie.
const FOLLOW_MIN_ZOOM = 8
const FOLLOW_PAN_S = 2

function FollowAircraft({ aircraft, followHex }) {
  const map = useMap()
  const startedRef = useRef(null)
  useEffect(() => {
    if (!followHex) { startedRef.current = null; return }
    const ac = aircraft.find(a => a.hex === followHex)
    if (!ac || ac.lat == null || ac.lon == null) return
    if (startedRef.current !== followHex) {
      startedRef.current = followHex
      map.flyTo([ac.lat, ac.lon], Math.max(map.getZoom(), FOLLOW_MIN_ZOOM), { duration: 0.8 })
      return
    }
    map.panTo([ac.lat, ac.lon], { animate: true, duration: FOLLOW_PAN_S, easeLinearity: 0.5 })
  }, [aircraft, followHex, map])
  return null
}

// Podpisy baz, stref i poligonów przy przybliżeniu 7 wchodziły na siebie
// (Nadarzyce na Mirosławcu, strefy PAŻP na nazwach baz). Po każdej zmianie
// widoku i każdej zmianie markerów ukrywamy podpis, który nachodzi na już
// postawiony — w kolejności ważności: polskie bazy, bazy NATO, strefy,
// poligony. Ukryty (visibility) nie łapie też kliknięć.
const LABEL_PRIORITY = [
  '.base-marker-label:not(.base-marker-label--nato)',
  '.base-marker-label--nato',
  '.airspace-marker-label',
  '.range-marker-label',
]

function LabelDeclutter() {
  const map = useMap()

  useEffect(() => {
    const pane = map.getPane('markerPane')
    let raf = 0
    const run = () => {
      raf = 0
      const placed = []
      for (const sel of LABEL_PRIORITY) {
        for (const el of pane.querySelectorAll(sel)) {
          el.style.visibility = ''
          const r = el.getBoundingClientRect()
          if (!r.width) continue
          const hit = placed.some(p =>
            r.left < p.right + 2 && r.right > p.left - 2 &&
            r.top < p.bottom + 1 && r.bottom > p.top - 1)
          if (hit) el.style.visibility = 'hidden'
          else placed.push(r)
        }
      }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(run) }
    // Markery dochodzą i znikają bez zdarzeń mapy (warstwy, co minutę strefy),
    // więc obserwujemy też sam panel. Zmiana `visibility` to atrybut, nie
    // dziecko — nie wywoła obserwatora ponownie.
    const obs = new MutationObserver(schedule)
    obs.observe(pane, { childList: true, subtree: true })
    map.on('zoomend moveend', schedule)
    schedule()
    return () => {
      obs.disconnect()
      map.off('zoomend moveend', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [map])

  return null
}

// Przesunięcie mapy musi odświeżyć zestaw widocznych znaczników — bez tego
// po przesunięciu widoku nowe maszyny pojawiłyby się dopiero przy następnym
// odświeżeniu danych (do 10 s).
// Strefy wybrane w „Planie dnia": przybliżenie do nich i wyraźny obrys —
// także gdy rezerwacja jest dopiero za kilka godzin i warstwa stref jej
// jeszcze nie rysuje. `focus.at` odróżnia ponowne kliknięcie tego samego bloku.
function PlanFocusLayer({ zones, focus }) {
  const map = useMap()
  const rings = useMemo(() => {
    if (!focus) return []
    const ids = new Set(focus.zones)
    return (zones || []).filter(z => ids.has(z.id)).flatMap(z => z.rings || [])
  }, [zones, focus])
  useEffect(() => {
    if (!rings.length) return
    const bounds = L.latLngBounds(rings.flat())
    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 9, duration: 0.8 })
  }, [map, rings, focus?.at])
  if (!rings.length) return null
  return rings.map((ring, i) => (
    <Polygon key={`${focus.at}-${i}`} positions={ring} interactive={false}
      pathOptions={{ color: '#ffffff', weight: 2.5, dashArray: '6 5', fillColor: '#ffffff', fillOpacity: 0.12 }} />
  ))
}

function MapViewTracker({ onMove }) {
  useMapEvents({ moveend: onMove, zoomend: onMove })
  return null
}

function ZoomTracker({ onZoomChange }) {
  const map = useMap()
  useEffect(() => {
    onZoomChange(map.getZoom())
    const handler = () => onZoomChange(map.getZoom())
    map.on('zoomend', handler)
    return () => { map.off('zoomend', handler) }
  }, [map, onZoomChange])
  return null
}


export default function RadarMap({
  aircraft, hasFetched, trails, serverTrails, center, gpsCenter, radius,
  selectedHex, focusHex, onSelect, showBases, showNatoBases, showRanges,
  airspace, showAirspace, recenterRef, planFocus, followHex,
  heading, compassState, onCompassRequest,
}) {
  const initialZoom = 6  // S4: was 5, but icons were too small at default view
  const [zoom, setZoom] = useState(initialZoom)
  const [viewTick, setViewTick] = useState(0)
  const tileLayer = BASE_TILE
  const zoomScale = useMemo(() => iconScaleForZoom(zoom), [zoom])
  const mapRef = useRef(null)
  // Dane dla dymków baz — aktualizowane po renderze, czytane przy otwarciu.
  const baseInfoRef = useRef({ zones: null })
  useEffect(() => {
    baseInfoRef.current = { zones: airspace?.zones ?? null, zonesError: !!airspace?.error }
  }, [airspace?.zones, airspace?.error])

  // Powrót do widoku startowego, wystawiony przez ref — wywołuje go
  // dotknięcie znacznika aplikacji w lewym górnym rogu (MapChrome), a
  // instancja Leafletu mieszka tylko tutaj. Wcześniej osobny przycisk GPS
  // centrował na pozycji użytkownika — usunięty jako zbędny (06.11.2026).
  useEffect(() => {
    if (!recenterRef) return
    recenterRef.current = () => mapRef.current?.flyTo(center, initialZoom, { duration: 0.6 })
    return () => { recenterRef.current = null }
  }, [recenterRef, center, initialZoom])

  // Trasa zaznaczonej maszyny (szczegóły w lib/trailSegments.js).
  const { trailSegments, trailStart } = useMemo(() => {
    if (!selectedHex || selectedHex.startsWith('__')) return { trailSegments: null, trailStart: null }
    const { segments, start } = buildTrailSegments(
      selectedHex,
      serverTrails?.get(selectedHex) || [],
      trails?.current?.get(selectedHex) || [],
      aircraft.find(a => a.hex === selectedHex),
    )
    return { trailSegments: segments, trailStart: start }
  }, [selectedHex, trails, serverTrails, aircraft])

  // V3: trail weight scales with zoom (thicker at higher zoom)
  const trailWeight = 1.5 + zoomScale * 1.6

  // Only show "no aircraft" message AFTER the first fetch completes —
  // before that, the empty array is just "we haven't loaded yet".
  const showEmpty = hasFetched && aircraft.length === 0
  const showLoading = !hasFetched

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MilRangeHatchDefs />
      {showLoading && (
        <div className="map-empty-state" role="status">
          {t('LOADING_AIRCRAFT')}
        </div>
      )}
      {showEmpty && (
        <div className="map-empty-state" role="status">
          {t('NO_AIRCRAFT')}
        </div>
      )}
      <MapContainer
        ref={mapRef}
        center={center}
        zoom={initialZoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer url={tileLayer.url} attribution={tileLayer.attribution} maxZoom={tileLayer.maxZoom} />
        <MapClickHandler onSelect={onSelect} />
        <TileFilter filter={tileLayer.filter} />
        <ZoomTracker onZoomChange={setZoom} />
        <SelectionFocus aircraft={aircraft} selectedHex={focusHex} />
        <FollowAircraft aircraft={aircraft} followHex={followHex} />
        <PlanFocusLayer zones={airspace?.zones} focus={planFocus} />
        <LabelDeclutter />

        {showAirspace && airspace?.zones && (
          <AirspaceLayer zones={airspace.zones} now={airspace.now} zoom={zoom} />
        )}

        <MilRangesLayer
          show={showRanges}
          zoom={zoom}
          basemapLabelsAreas={!!tileLayer.ownAreaLabels}
        />

        {showNatoBases && <BaseAreasLayer bases={MIL_BASES_NATO} variant="nato" />}
        {showBases && <BaseAreasLayer bases={MIL_BASES_PL} variant="pl" />}

        {showNatoBases && <BasesLayer zoom={zoom} bases={MIL_BASES_NATO} variant="nato" infoRef={baseInfoRef} />}
        {showBases && <BasesLayer zoom={zoom} bases={MIL_BASES_PL} variant="pl" infoRef={baseInfoRef} />}

        {radius && gpsCenter && (
          <Circle center={gpsCenter} radius={radius * 1000} pathOptions={{
            color: '#00ff88', fillOpacity: 0, weight: 1.5, dashArray: '6 4',
          }} />
        )}

        <UserLocation position={gpsCenter} heading={heading}
          compassState={compassState} onCompassRequest={onCompassRequest} />

        {trailSegments && trailSegments.map(seg => (
          <Polyline key={seg.key} positions={seg.positions}
            pathOptions={{ color: seg.color, weight: trailWeight, opacity: 0.85 }} />
        ))}

        {/* V2: green dot at the trail start, so direction is visible at a glance */}
        {trailStart && (
          <CircleMarker
            center={[trailStart.lat, trailStart.lon]}
            radius={4}
            pathOptions={{ color: '#00ff88', fillColor: '#00ff88', fillOpacity: 0.9, weight: 2 }}
          />
        )}

        <MapViewTracker onMove={() => setViewTick(t => t + 1)} />

        <AircraftLayer
          viewTick={viewTick}
          aircraft={aircraft}
          selectedHex={selectedHex}
          onSelect={onSelect}
          zoomScale={zoomScale}
        />
      </MapContainer>
    </div>
  )
}
