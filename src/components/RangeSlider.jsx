import { RANGE_ANCHORS, RANGE_SEG, rangePosToKm, rangeKmToPos } from '../lib/range'
import { t } from '../i18n'

// Suwak zasięgu alertów. Wydzielony, bo żyje w dwóch miejscach naraz: w panelu
// Ustawienia i w arkuszu dolnym na głównym ekranie. Znaczniki skali stoją NA
// torze, nie pod nim — skala jest nieliniowa, a równo rozstawione liczby pod
// spodem sugerowały coś przeciwnego.
export default function RangeSlider({ radius, setRadius, showValue = true }) {
  const max = (RANGE_ANCHORS.length - 1) * RANGE_SEG
  return (
    <div className="range-block">
      {showValue && (
        <div className="range-head">
          <span className="range-head__label">{t('RANGE_LABEL')}</span>
          <span className="range-head__value">{radius}</span>
          <span className="range-head__unit">km</span>
        </div>
      )}
      <div className="range-track">
        {RANGE_ANCHORS.map((a, i) => (
          <span key={a} className="range-tick"
            style={{ left: `${(i / (RANGE_ANCHORS.length - 1)) * 100}%` }} />
        ))}
        <input
          type="range" min="0" max={max} step="1"
          value={rangeKmToPos(radius)}
          aria-label={t('RANGE_LABEL')}
          onChange={e => setRadius(rangePosToKm(Number(e.target.value)))}
          className="range-slider"
        />
      </div>
      <div className="range-marks">
        {RANGE_ANCHORS.map(a => <span key={a}>{a}</span>)}
      </div>
    </div>
  )
}
