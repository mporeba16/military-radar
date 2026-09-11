import { TILE_LAYERS, tileThumbUrl } from './RadarMap'
import Toggle from './Toggle'
import { t } from '../i18n'
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
  altBands, setAltBands, bandCounts,
}) {
  return (
    <div className="panel-body">

      <section className="cp-section">
        <div className="cp-label">{t('MAP_BASE_LABEL')}</div>
        <div className="tile-grid">
          {TILE_LAYERS.map(layer => {
            const active = activeTileId === layer.id
            return (
              <button key={layer.id}
                className={`tile-card ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => setActiveTileId(layer.id)}>
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
        </div>
      </section>

      <section className="cp-section">
        <div className="cp-label">{t('OVERLAYS_LABEL')}</div>
        <div className="toggle-list">
          <Toggle
            on={showBases}
            onToggle={() => setShowBases(b => !b)}
            label={t('BASES_LABEL')}
            marker={<span className="toggle-swatch" style={{
              background: showBases ? 'rgba(255,179,0,0.2)' : 'transparent',
            }} />}
            state={showBases ? '◉' : '○'}
            stateColor={showBases ? '#ffb300' : 'rgba(255,255,255,0.4)'}
          />
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
