import { useRef } from 'react'
import RangeSlider from './RangeSlider'
import AircraftInfoPanel, { operatorFrom } from './AircraftInfoPanel'
import { t } from '../i18n'
import { planeWord } from '../lib/plural'
import { compassDir, flightLevel } from '../lib/notifyText'

const KIND_COLOR = { mil: '#00ff88', heli: '#00d9ff', heavy: '#ffb300' }
const NEAR_KM = 10
const SWIPE_PX = 40

// Poziom lotu i kurs formatuje ten sam moduł, co treść powiadomień — wiersz
// listy i push mówią o maszynie dokładnie tak samo.
function detailLine(ac) {
  const parts = []
  const fl = flightLevel(ac.alt_baro)
  if (fl) parts.push(fl)
  const c = compassDir(ac.track)
  if (c) parts.push(`kurs ${c}`)
  return parts.join(' · ')
}

function AircraftRow({ ac, onSelect }) {
  const kind = ac.kind || 'mil'
  const operator = operatorFrom(ac.flight)
  return (
    <button className="sheet-row" onClick={() => onSelect(ac.hex)}>
      <span className="sheet-row__dot" style={{ background: KIND_COLOR[kind] || KIND_COLOR.mil }} />
      <span className="sheet-row__id">
        <span className="sheet-row__call">{ac.flight?.trim() || ac.hex}</span>
        <span className="sheet-row__sub">{[ac.t || '?', operator].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="sheet-row__grow" />
      <span className="sheet-row__num">
        <span className="sheet-row__dist">{Math.round(ac._dist)} km</span>
        <span className="sheet-row__sub">{detailLine(ac)}</span>
      </span>
    </button>
  )
}

// Arkusz dolny — jedyne miejsce, w którym główny ekran mówi cokolwiek o stanie.
// Zwinięty odpowiada „ile i co najbliżej", rozwinięty daje listę od najbliższej
// i suwak zasięgu, a po wybraniu maszyny zamienia się w jej kartę. Wszystko w
// zasięgu kciuka, zamiast dwóch dotknięć w głąb panelu Ustawienia.
export default function BottomSheet({
  inRange, inRangeCount, hasGps,
  radius, setRadius,
  expanded, setExpanded,
  alerts, onDismissAlert, onOpenAlert,
  selectedAc, trailSources, firstSeen, onCloseSelected, onSelect,
}) {
  const touchStartY = useRef(null)

  const onTouchStart = (e) => { touchStartY.current = e.touches[0]?.clientY ?? null }
  const onTouchEnd = (e) => {
    const start = touchStartY.current
    touchStartY.current = null
    if (start == null) return
    const dy = (e.changedTouches[0]?.clientY ?? start) - start
    if (dy < -SWIPE_PX) setExpanded(true)
    else if (dy > SWIPE_PX) setExpanded(false)
  }

  // Karta wybranej maszyny wchodzi w arkusz zamiast wisieć nad mapą.
  if (selectedAc) {
    return (
      <div className="sheet sheet--card">
        <div className="sheet__grip"><span /></div>
        <button className="sheet__back" onClick={onCloseSelected}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          {t('SHEET_BACK')}
        </button>
        <AircraftInfoPanel
          key={selectedAc.hex}
          ac={selectedAc}
          variant="sheet"
          trailSources={trailSources}
          firstSeen={firstSeen}
          onClose={onCloseSelected}
        />
      </div>
    )
  }

  const top = alerts[0]
  const nearest = inRange[0]

  return (
    <div className={`sheet ${expanded ? 'sheet--open' : ''}`}>

      {/* Alert dokleja się do górnej krawędzi arkusza. Wcześniej stos toastów
          lądował na środku góry i potrafił zająć trzecią część ekranu. */}
      {top && (
        <div className={`sheet-alert ${(top.ac.kind || 'mil') === 'mil' && top.dist <= NEAR_KM ? 'near' : ''}`}
          style={{ '--kind-color': KIND_COLOR[top.ac.kind || 'mil'] || KIND_COLOR.mil }}>
          <button className="sheet-alert__body" onClick={() => onOpenAlert(top.ac.hex)}>
            <span className="sheet-alert__dot" />
            <span className="sheet-alert__tag">
              {(top.ac.kind || 'mil') === 'mil' && top.dist <= NEAR_KM ? t('ALERT_TAG_NEAR') : t('ALERT_TAG')}
            </span>
            <span className="sheet-alert__call">{top.ac.flight?.trim() || top.ac.hex}</span>
            <span className="sheet-row__grow" />
            <span className="sheet-alert__dist">{Math.round(top.dist)} km</span>
          </button>
          {alerts.length > 1 && <span className="sheet-alert__more">+{alerts.length - 1}</span>}
          <button className="sheet-alert__x" aria-label={t('DISMISS_NOTIFICATION')}
            onClick={() => onDismissAlert(top.hex)}>✕</button>
        </div>
      )}

      <button
        className="sheet__head"
        aria-expanded={expanded}
        aria-label={expanded ? t('SHEET_COLLAPSE') : t('SHEET_EXPAND')}
        onClick={() => setExpanded(!expanded)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}>
        <span className="sheet__grip"><span /></span>
        <span className="sheet__headrow">
          <span className="sheet__count">
            {hasGps
              ? `${inRangeCount} ${planeWord(inRangeCount).toUpperCase()} ${t('SHEET_IN_RANGE')}`
              : t('SHEET_NO_GPS')}
          </span>
          <span className="sheet-row__grow" />
          {!expanded && hasGps && <span className="sheet__chip">{radius} km</span>}
          <svg className="sheet__chev" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d={expanded ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </span>
      </button>

      <div className="sheet__body">
        {expanded && hasGps && (
          <div className="sheet__range">
            <RangeSlider radius={radius} setRadius={setRadius} />
          </div>
        )}

        {!hasGps
          ? null
          : inRange.length === 0
            ? <p className="sheet__empty">{t('SHEET_EMPTY')}</p>
            : expanded
              ? <div className="sheet__list">
                  {inRange.map(ac => <AircraftRow key={ac.hex} ac={ac} onSelect={onSelect} />)}
                </div>
              : nearest && <AircraftRow ac={nearest} onSelect={onSelect} />}
      </div>
    </div>
  )
}
