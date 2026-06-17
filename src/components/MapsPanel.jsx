import { TILE_LAYERS, AltitudeLegend } from './RadarMap'
import Toggle from './Toggle'
import { t } from '../i18n'

// Panel „Mapy": wybór warstwy podkładu, nakładki (bazy wojskowe) i legenda
// wysokości. Wydzielony z App.jsx, żeby kontener stanu nie puchł.
export default function MapsPanel({ activeTileId, setActiveTileId, showBases, setShowBases }) {
  return (
    <div className="panel-body">
      <div className="cp-label">{t('SELECT_MAP')}</div>
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

      <section className="cp-section" style={{ marginTop: 16 }}>
        <div className="cp-label">{t('OVERLAYS_LABEL')}</div>
        <Toggle
          on={showBases}
          onToggle={() => setShowBases(b => !b)}
          label={t('BASES_LABEL')}
          style={{ marginTop: 6, background: showBases ? 'rgba(255,179,0,0.12)' : undefined }}
          marker={<span className="toggle-swatch" style={{
            background: showBases ? 'rgba(255,179,0,0.2)' : 'transparent',
          }} />}
          state={showBases ? '◉' : '○'}
          stateColor={showBases ? '#ffb300' : 'rgba(255,255,255,0.4)'}
        />
      </section>

      <section className="cp-section" style={{ marginTop: 16 }}>
        <div className="cp-label">{t('ALT_LEGEND_LABEL')}</div>
        <div style={{ marginTop: 6 }}><AltitudeLegend /></div>
      </section>
    </div>
  )
}
