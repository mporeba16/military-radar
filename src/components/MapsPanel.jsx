import { TILE_LAYERS, tileThumbUrl, resolveTileId } from './RadarMap'
import { useState } from 'react'
import Toggle from './Toggle'
import { t } from '../i18n'
import { BASE_PL, BASE_NATO, RANGE, AIRSPACE } from '../lib/palette'
import { KIND_ROWS } from '../lib/alertsState'
import { ALT_BANDS } from '../lib/altBands'
import { altToColor } from './aircraftShapes'

// Panel „Mapy": podkład, nakładki i filtr wysokości.
//
// Podkład wybiera się z podglądów, nie z listy technicznych nazw — „OSM ADSBx"
// i „OpenStreetMap" to ten sam serwis różniący się filtrem przyciemniającym,
// czego z samej nazwy nie dało się odgadnąć. Miniatura to prawdziwy kafelek z
// tego samego szablonu URL, z nałożonym tym samym filtrem CSS co na mapie.
export default function MapsPanel({
  activeTileId, setActiveTileId, showBases, setShowBases,
  showNatoBases, setShowNatoBases,
  showRanges, setShowRanges,
  showAirspace, setShowAirspace, airspaceError,
  kinds, setKinds,
  altBands, setAltBands, bandCounts,
}) {
  const [baseOpen, setBaseOpen] = useState(false)
  const active = TILE_LAYERS.find(l => l.id === resolveTileId(activeTileId)) || TILE_LAYERS[0]

  return (
    <div className="panel-body">

      {/* Podkład zmienia się raz na jakiś czas, a siatka sześciu podglądów
          zajmowała pół panelu i spychała warstwy poniżej krawędzi ekranu.
          Domyślnie zwinięty wiersz pokazuje, co jest wybrane; siatka
          rozwija się dopiero, gdy naprawdę chcesz zmienić. */}
      <section className="cp-section">
        <div className="cp-label">{t('MAP_BASE_LABEL')}</div>

        <button className={`tile-current ${baseOpen ? 'open' : ''}`}
          aria-expanded={baseOpen}
          onClick={() => setBaseOpen(o => !o)}>
          <span className="tile-current__thumb"
            style={active.filter ? { filter: active.filter } : undefined}>
            <img src={tileThumbUrl(active)} alt="" loading="lazy" />
          </span>
          <span className="tile-current__meta">
            <span className="tile-current__name">{active.label || active.name}</span>
            <span className="tile-current__src">{active.sub || active.name}</span>
          </span>
          <span className="tile-current__chev">{baseOpen ? '⌃' : '⌄'}</span>
        </button>

        {baseOpen && <div className="tile-grid">
          {TILE_LAYERS.map(layer => {
            const active = activeTileId === layer.id
            return (
              <button key={layer.id}
                className={`tile-card ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => { setActiveTileId(layer.id); setBaseOpen(false) }}>
                <span className="tile-card__thumb"
                  style={layer.filter ? { filter: layer.filter } : undefined}>
                  <img src={tileThumbUrl(layer)} alt="" loading="lazy" />
                  {layer.overlay && (
                    <img src={tileThumbUrl(layer, 'overlay')} alt="" loading="lazy" />
                  )}
                </span>
                <span className="tile-card__meta">
                  <span className="tile-card__name">{layer.label || layer.name}</span>
                  <span className="tile-card__src">{layer.sub || layer.name}</span>
                </span>
              </button>
            )
          })}
        </div>}
      </section>

      <section className="cp-section">
        <div className="cp-label">{t('OVERLAYS_LABEL')}</div>
        <div className="toggle-list">
          <Toggle
            on={showBases}
            onToggle={() => setShowBases(b => !b)}
            label={t('BASES_LABEL')}
            marker={<span className="toggle-swatch" style={{
              background: showBases ? 'rgba(220, 47, 61, 0.25)' : 'transparent',
              color: showBases ? BASE_PL : 'rgba(255,255,255,0.3)',
            }} />}
            state={showBases ? '◉' : '○'}
            stateColor={showBases ? BASE_PL : 'rgba(255,255,255,0.4)'}
          />
          <Toggle
            on={showNatoBases}
            onToggle={() => setShowNatoBases(b => !b)}
            label={t('NATO_BASES_LABEL')}
            marker={<span className="toggle-swatch" style={{
              background: showNatoBases ? 'rgba(124, 58, 237, 0.3)' : 'transparent',
              color: showNatoBases ? BASE_NATO : 'rgba(255,255,255,0.3)',
            }} />}
            state={showNatoBases ? '◉' : '○'}
            stateColor={showNatoBases ? BASE_NATO : 'rgba(255,255,255,0.4)'}
          />
          <Toggle
            on={showRanges}
            onToggle={() => setShowRanges(b => !b)}
            label={t('RANGES_LABEL')}
            marker={<span className="toggle-swatch" style={{
              background: showRanges ? 'rgba(232, 116, 28,0.28)' : 'transparent',
              color: showRanges ? RANGE : 'rgba(255,255,255,0.3)',
            }} />}
            state={showRanges ? '◉' : '○'}
            stateColor={showRanges ? RANGE : 'rgba(255,255,255,0.4)'}
          />
          <Toggle
            on={showAirspace}
            onToggle={() => setShowAirspace(b => !b)}
            label={t('AIRSPACE_LABEL')}
            title={t('AIRSPACE_HINT')}
            marker={<span className="toggle-swatch toggle-swatch--dashed" style={{
              background: showAirspace ? 'rgba(227, 220, 85, 0.12)' : 'transparent',
              color: showAirspace ? AIRSPACE : 'rgba(255,255,255,0.3)',
            }} />}
            state={showAirspace ? '◉' : '○'}
            stateColor={showAirspace ? AIRSPACE : 'rgba(255,255,255,0.4)'}
          />
        </div>
        {showAirspace && airspaceError && (
          <p className="layer-note">{t('AIRSPACE_ERROR')}</p>
        )}
      </section>

      {/* Kategorie maszyn — sterują TYM, CO WIDAĆ na mapie (i przy okazji
          powiadomieniami), więc mieszkają przy warstwach, a nie w alertach. */}
      <section className="cp-section">
        <div className="cp-label">{t('FILTER_LABEL')}</div>
        <div className="toggle-list">
          {KIND_ROWS.map(({ key, labelKey, color }) => (
            <Toggle
              key={key}
              on={kinds[key]}
              onToggle={() => setKinds(prev => ({ ...prev, [key]: !prev[key] }))}
              label={t(labelKey)}
              title={t('FILTER_HINT')}
              style={{ opacity: kinds[key] ? 1 : 0.55 }}
              marker={<span className="toggle-dot" style={{
                background: kinds[key] ? color : 'transparent',
                border: `2px solid ${color}`,
              }} />}
              state={kinds[key] ? '◉' : '○'}
              stateColor={kinds[key] ? color : 'rgba(255,255,255,0.4)'}
            />
          ))}
        </div>
      </section>

      <section className="cp-section">
        <div className="cp-label">{t('ALT_FILTER_LABEL')}</div>
        <div className="band-list">
          {ALT_BANDS.map(b => {
            const on = altBands[b.id]
            const hi = Number.isFinite(b.max) ? b.max : 12200
            return (
              <button key={b.id}
                className={`band-row ${on ? '' : 'off'}`}
                aria-pressed={on}
                onClick={() => setAltBands(prev => ({ ...prev, [b.id]: !prev[b.id] }))}>
                <span className="band-row__sw" style={{
                  background: `linear-gradient(90deg, ${altToColor(b.min)}, ${altToColor(hi)})`,
                }} />
                <span className="band-row__label">{b.label}</span>
                <span className="band-row__count">{bandCounts?.[b.id] || 0}</span>
              </button>
            )
          })}
        </div>
      </section>

    </div>
  )
}
