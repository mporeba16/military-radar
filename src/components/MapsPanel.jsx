import Toggle, { onOff } from './Toggle'
import { t } from '../i18n'
import { BASE_PL, BASE_NATO, RANGE, AIRSPACE } from '../lib/palette'
import { KIND_ROWS } from '../lib/alertsState'
import { IconHangar, IconNatoStar, IconTarget, IconZone, IconFighter, IconHelicopter, IconJumbo } from './UiIcons'

// Ikona warstwy albo kategorii w jej kolorze z mapy; wyłączona — szara.
// Kategorie dostały rysowane sylwetki zamiast miniatur ikon z mapy — te
// miały różne proporcje i szczegóły, a w liście wyglądały nierówno.
const KIND_ICONS = { mil: IconFighter, heli: IconHelicopter, heavy: IconJumbo }
function KindGlyph({ kind }) {
  const Glyph = KIND_ICONS[kind]
  return <Glyph />
}
function LayerIcon({ on, color, children }) {
  return <span className="toggle-ico" style={{ color: on ? color : 'rgba(255,255,255,0.35)' }}>{children}</span>
}

// Panel „Mapy": nakładki i kategorie maszyn. Podkład jest jeden (ciemny
// OpenStreetMap, lib/tiles.js) — wybór podkładu zniknął 06.11.2026.
export default function MapsPanel({
  showBases, setShowBases,
  showNatoBases, setShowNatoBases,
  showRanges, setShowRanges,
  showAirspace, setShowAirspace, airspaceError,
  kinds, setKinds,
}) {

  return (
    <div className="panel-body">

      <section className="cp-section">
        <div className="cp-label">{t('OVERLAYS_LABEL')}</div>
        <div className="toggle-list">
          <Toggle
            on={showBases}
            onToggle={() => setShowBases(b => !b)}
            label={t('BASES_LABEL')}
            marker={<LayerIcon on={showBases} color={BASE_PL}><IconHangar /></LayerIcon>}
            {...onOff(showBases)}
          />
          <Toggle
            on={showNatoBases}
            onToggle={() => setShowNatoBases(b => !b)}
            label={t('NATO_BASES_LABEL')}
            marker={<LayerIcon on={showNatoBases} color={BASE_NATO}><IconNatoStar /></LayerIcon>}
            {...onOff(showNatoBases)}
          />
          <Toggle
            on={showRanges}
            onToggle={() => setShowRanges(b => !b)}
            label={t('RANGES_LABEL')}
            marker={<LayerIcon on={showRanges} color={RANGE}><IconTarget /></LayerIcon>}
            {...onOff(showRanges)}
          />
          <Toggle
            on={showAirspace}
            onToggle={() => setShowAirspace(b => !b)}
            label={t('AIRSPACE_LABEL')}
            title={t('AIRSPACE_HINT')}
            marker={<LayerIcon on={showAirspace} color={AIRSPACE}><IconZone /></LayerIcon>}
            {...onOff(showAirspace)}
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
              marker={<LayerIcon on={kinds[key]} color={color}><KindGlyph kind={key} /></LayerIcon>}
              {...onOff(kinds[key])}
            />
          ))}
        </div>
      </section>

    </div>
  )
}
