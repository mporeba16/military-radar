import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './RadarMap.css'
import { MIL_BASES_PL, MIL_BASES_NATO } from '../airfields'
import { BASE_PL, BASE_NATO } from '../lib/palette'
import AirspaceLayer from './AirspaceLayer'
import { basePopupHtml } from './basePopup'
import MilRangesLayer, { MilRangeHatchDefs, HatchedPolygon, AREA_LABEL_ZOOM } from './MilRangesLayer'
import { MIL_AIRFIELD_AREAS } from '../data/milAirfieldAreas'
import { t } from '../i18n'
import { buildTrailSegments } from '../lib/trailSegments'
import AircraftLayer, { iconScaleForZoom } from './AircraftLayer'
import { TILE_LAYERS, tileThumbUrl, resolveTileId } from '../lib/tiles'

function MapClickHandler({ onSelect }) {
  useMapEvents({ click: () => onSelect(null) })
  return null
}

// Statyczna warstwa polskich baz wojskowych (Łask, Krzesiny…). Rysowana POD
// samolotami (zIndexOffset ujemny). Nazwa pokazuje się od tego samego
// przybliżenia co nazwy poligonów (AREA_LABEL_ZOOM).

// Przybliżenie po wyśrodkowaniu na GPS — region, nie ulica: chodzi o „co lata
// koło mnie", a nie o to, nad którym budynkiem.
const RECENTER_GPS_ZOOM = 9
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
        ? `<span class="base-marker-label${labelMod}">${ap.name}</span>`
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
      m.on('popupopen', e => {
        m.closeTooltip()
        const el = e.popup.getElement()
        // Leaflet trzyma ten sam element dymka między otwarciami — nasłuch
        // podpinamy raz, inaczej każde otwarcie dokładałoby kolejny.
        if (!el || el.dataset.bound) return
        el.dataset.bound = '1'
        el.addEventListener('click', ev => {
          const btn = ev.target.closest('[data-hex]')
          if (!btn) return
          infoRef.current.onSelect(btn.dataset.hex)
          map.closePopup()
        })
      })
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

// Lista podkładów mieszka w lib/tiles.js — tu tylko re-eksport, bo panel Mapy
// importuje ją historycznie z tego modułu.
export { TILE_LAYERS, tileThumbUrl, resolveTileId }

export default function RadarMap({
  aircraft, hasFetched, trails, serverTrails, center, gpsCenter, radius,
  selectedHex, focusHex, onSelect, activeTileId, showBases, showNatoBases, showRanges,
  airspace, showAirspace, recenterRef, planFocus,
}) {
  const initialZoom = 6  // S4: was 5, but icons were too small at default view
  const [zoom, setZoom] = useState(initialZoom)
  const [viewTick, setViewTick] = useState(0)
  const tileLayer = TILE_LAYERS.find(l => l.id === resolveTileId(activeTileId)) || TILE_LAYERS[0]
  const zoomScale = useMemo(() => iconScaleForZoom(zoom), [zoom])
  const mapRef = useRef(null)
  // Dane dla dymków baz — aktualizowane po renderze, czytane przy otwarciu.
  const baseInfoRef = useRef({ zones: null, aircraft: [], onSelect: () => {} })
  useEffect(() => {
    baseInfoRef.current = { zones: airspace?.zones ?? null, zonesError: !!airspace?.error, aircraft, onSelect }
  }, [airspace?.zones, airspace?.error, aircraft, onSelect])

  // Akcja „wróć do widoku" wystawiona przez ref, bo przycisk mieszka w chrome
  // nad mapą (MapChrome), a instancja Leafletu tylko tutaj. Osobny stos
  // przycisków wewnątrz RadarMap rozjeżdżałby się z tamtym przy każdej zmianie
  // odstępów, więc wolę jeden stos i jedną referencję.
  //
  // Z GPS-em lecimy na pozycję użytkownika, bez niego na widok startowy —
  // „wyśrodkuj" ma zawsze coś znaczyć, także zanim GPS zdąży złapać fixa.
  useEffect(() => {
    if (!recenterRef) return
    recenterRef.current = () => {
      const map = mapRef.current
      if (!map) return
      if (gpsCenter) map.flyTo(gpsCenter, RECENTER_GPS_ZOOM, { duration: 0.6 })
      else map.flyTo(center, initialZoom, { duration: 0.6 })
    }
    return () => { recenterRef.current = null }
  }, [recenterRef, gpsCenter, center, initialZoom])

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
        <TileLayer key={tileLayer.id} url={tileLayer.url} attribution={tileLayer.attribution} maxZoom={tileLayer.maxZoom} />
        {tileLayer.overlay && (
          <TileLayer key={`${tileLayer.id}-ref`} url={tileLayer.overlay} maxZoom={tileLayer.maxZoom} />
        )}
        <MapClickHandler onSelect={onSelect} />
        <TileFilter filter={tileLayer.filter} />
        <ZoomTracker onZoomChange={setZoom} />
        <SelectionFocus aircraft={aircraft} selectedHex={focusHex} />
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
