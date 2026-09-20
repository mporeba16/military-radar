import Toggle from './Toggle'
import RangeSlider from './RangeSlider'
import { t } from '../i18n'
import { planeWord } from '../lib/plural'
import { KIND_COLORS } from '../lib/palette'
import { ARRIVAL_AIRPORTS } from '../lib/inbound'
import { readiness, kindsOnCount } from '../lib/alertsState'

// iPadOS 13+ reports as "MacIntel" but has a touch screen — catch it too.
const IS_IOS = typeof navigator !== 'undefined' && (
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)
function isStandalonePWA() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}

// Panel Alerty — wszystko, co decyduje o TYM, KIEDY dostaniesz sygnał:
// gotowość, zasięg, push, przyloty wielkich transportowców, dźwięk i wibracja.
// Wydzielony z dawnego panelu Ustawienia, który zebrał osiem niepowiązanych
// sekcji: od zasięgu alertów po diagnostykę serwera.
export default function AlertsPanel({
  location, locationError, requestLocation,
  radius, setRadius, inRangeCount, alertsCount,
  kinds, setKinds,
  permissionState, isSubscribed, isSubscribing, subscribe, unsubscribe, subscribeError,
  soundOn, setSoundOn, vibrateOn, setVibrateOn,
  arrivals, setArrivals,
}) {
  const kindsOn = kindsOnCount(kinds)
  const state = readiness({ hasGps: !!location, pushOn: isSubscribed, kindsOn, locationError })
  const pushUsable = permissionState !== 'unsupported' && permissionState !== 'denied'

  return (
    <div className="panel-body">

      {/* 1. Czy to w ogóle zadziała — odpowiedź zanim cokolwiek przewiniesz. */}
      <div className={`ready-card ready-${state.level}`}>
        <span className="ready-title">{state.level === 'ok' ? '◉' : '⚠'} {state.title}</span>
        {state.why && <span className="ready-why">{state.why}</span>}
        {state.retry && (
          <button className="btn-gps-fix" onClick={requestLocation}>◎ {t('GPS_RETRY')}</button>
        )}
        <div className="ready-conds">
          <span className={`ready-cond ${location ? 'on' : ''}`}>{t('READY_COND_GPS')}</span>
          <span className={`ready-cond ${isSubscribed ? 'on' : ''}`}>{t('READY_COND_PUSH')}</span>
          <span className={`ready-cond ${kindsOn > 0 ? 'on' : ''}`}>{kindsOn}/3 {t('READY_COND_KINDS')}</span>
        </div>
      </div>

      {/* 2. Zasięg — jedyna kontrolka ruszana regularnie, więc idzie na wierzch. */}
      <section className="cp-section">
        <RangeSlider radius={radius} setRadius={setRadius} />
        {location && (
          <p className="info-text range-count">
            {t('IN_RANGE_NOW')}{' '}
            <strong className={inRangeCount > 0 ? 'count-live' : 'count-idle'}>
              {inRangeCount} {planeWord(inRangeCount)}
            </strong>
            {inRangeCount > alertsCount && (
              <span className="count-note"> ({t('VISIBLE_ALERTS')} {alertsCount})</span>
            )}
          </p>
        )}
      </section>

      {/* 3. Push — kanał działający przy zamkniętej aplikacji. */}
      <section className="cp-section">
        <div className="cp-label">{t('PUSH_LABEL')}</div>
        {!pushUsable
          ? (permissionState === 'denied'
              ? <p className="err small">{t('PUSH_DENIED')}</p>
              : <p className="info-text">{IS_IOS && !isStandalonePWA() ? t('PUSH_IOS_INSTALL') : t('PUSH_UNSUPPORTED')}</p>)
          : isSubscribed
            ? <div className="toggle-list">
                <Toggle
                  on
                  onToggle={unsubscribe}
                  label={t('PUSH_ROW_LABEL')}
                  title={t('PUSH_DESCRIPTION')}
                  marker={<span className="toggle-dot" style={{ background: '#00ff88' }} />}
                  state={t('SOUND_ON')}
                  stateColor="#00ff88"
                />
                {/* Niezależne od GPS i zasięgu: tankowce, AWACS, rozpoznanie
                    nad całą Polską. Jedzie w tym samym obiekcie `kinds`. */}
                <Toggle
                  on={kinds.rare !== false}
                  onToggle={() => setKinds(prev => ({ ...prev, rare: prev.rare === false }))}
                  label={t('RARE_LABEL')}
                  title={t('RARE_HINT')}
                  marker={<span className="toggle-ico">🛰</span>}
                  state={kinds.rare !== false ? t('SOUND_ON') : t('SOUND_OFF')}
                  stateColor={kinds.rare !== false ? '#00ff88' : 'rgba(255,255,255,0.4)'}
                />
              </div>
            : <>
                <button className="btn-subscribe" onClick={subscribe} disabled={isSubscribing}>
                  {isSubscribing ? t('PUSH_CONNECTING') : t('PUSH_ENABLE')}
                </button>
                {subscribeError && <p className="err small mt6">✗ {subscribeError}</p>}
              </>
        }
      </section>

      {/* 4. Sygnały w otwartej aplikacji — osobny mechanizm, osobna sekcja. */}
      <section className="cp-section">
        <div className="cp-label">{t('IN_APP_SECTION')}</div>
        <div className="toggle-list">
          <Toggle
            on={soundOn}
            onToggle={() => setSoundOn(s => !s)}
            label={t('SOUND_LABEL')}
            marker={<span className="toggle-ico">{soundOn ? '🔔' : '🔕'}</span>}
            state={soundOn ? t('SOUND_ON') : t('SOUND_OFF')}
            stateColor={soundOn ? '#00ff88' : 'rgba(255,255,255,0.4)'}
          />
          {'vibrate' in navigator && (
            <Toggle
              on={vibrateOn}
              onToggle={() => setVibrateOn(v => !v)}
              label={t('VIBRATION_LABEL')}
              marker={<span className="toggle-ico">📳</span>}
              state={vibrateOn ? t('SOUND_ON') : t('SOUND_OFF')}
              stateColor={vibrateOn ? '#00ff88' : 'rgba(255,255,255,0.4)'}
            />
          )}
        </div>
      </section>

      {/* 5. Wielkie transportowce z celem w Polsce — osobno dla każdego
          lotniska, bo interesujący bywa tylko jeden kierunek. */}
      <section className="cp-section">
        <div className="cp-label">{t('ARRIVALS_LABEL')}</div>
        <div className="toggle-list">
          {ARRIVAL_AIRPORTS.map(ap => {
            const on = arrivals[ap.icao] !== false
            return (
              <Toggle
                key={ap.icao}
                on={on}
                onToggle={() => setArrivals(prev => ({ ...prev, [ap.icao]: prev[ap.icao] === false }))}
                label={`${ap.name} (${ap.icao})`}
                title={t('ARRIVALS_HINT')}
                marker={<span className="toggle-ico">🛬</span>}
                state={on ? t('SOUND_ON') : t('SOUND_OFF')}
                stateColor={on ? KIND_COLORS.heavy : 'rgba(255,255,255,0.4)'}
              />
            )
          })}
        </div>
      </section>

    </div>
  )
}
