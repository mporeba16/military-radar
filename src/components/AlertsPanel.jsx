import Toggle, { onOff } from './Toggle'
import { IconSound, IconVibrate, IconLanding, IconRadar } from './UiIcons'
import RangeSlider from './RangeSlider'
import { t } from '../i18n'
import { planeWord } from '../lib/plural'
import { ARRIVAL_AIRPORTS } from '../lib/inbound'
import { alertsLevel, kindsOnCount } from '../lib/alertsState'

// iPadOS 13+ reports as "MacIntel" but has a touch screen — catch it too.
const IS_IOS = typeof navigator !== 'undefined' && (
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)
function isStandalonePWA() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}

function ReadyBar({ level, reason, onRetryGps }) {
  return (
    <div className={`ready-bar ready-${level}`} title={reason ? t(`READY_REASON_${reason}`) : undefined} role="status">
      <span className="ready-bar__dot" aria-hidden="true" />
      <span className="ready-bar__text">
        <span className="ready-bar__title">{level === 'ok' ? t('READY_OK') : t('READY_NO_GPS')}</span>
        {reason && <span className="ready-bar__reason">{t(`READY_SHORT_${reason}`)}</span>}
      </span>
      {/* Ponowienie GPS — wcześniej robił to przycisk celownika na mapie. */}
      {reason === 'GPS' && onRetryGps && (
        <button type="button" className="ready-bar__action" onClick={onRetryGps}>{t('READY_RETRY_GPS')}</button>
      )}
    </div>
  )
}

// Panel Alerty — wszystko, co decyduje o TYM, KIEDY dostaniesz sygnał:
// gotowość, zasięg, push, przyloty wielkich transportowców, dźwięk i wibracja.
// Wydzielony z dawnego panelu Ustawienia, który zebrał osiem niepowiązanych
// sekcji: od zasięgu alertów po diagnostykę serwera.
export default function AlertsPanel({
  location, onRetryGps,
  radius, setRadius, inRangeCount, alertsCount,
  kinds, setKinds,
  permissionState, isSubscribed, isSubscribing, subscribe, unsubscribe, subscribeError,
  soundOn, setSoundOn, vibrateOn, setVibrateOn,
  arrivals, setArrivals,
  children,
}) {
  const kindsOn = kindsOnCount(kinds)
  const level = alertsLevel({ hasGps: !!location, pushOn: isSubscribed, kindsOn })
  const pushUsable = permissionState !== 'unsupported' && permissionState !== 'denied'

  return (
    <div className="panel-body panel-body--footer">

      {/* 1. Czy to w ogóle zadziała — jeden niski pasek: stan i krótki powód
          (pierwszy brakujący warunek, w kolejności z alertsLevel), pełne
          wyjaśnienie w podpowiedzi. Wcześniej karta na trzy linie z dużym
          przyciskiem zajmowała ćwierć panelu. */}
      <ReadyBar level={level} reason={level === 'ok' ? null : !location ? 'GPS' : kindsOn === 0 ? 'KINDS' : 'PUSH'}
        onRetryGps={onRetryGps} />

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
                  {...onOff(true)}
                />
                {/* Niezależne od GPS i zasięgu: tankowce, AWACS, rozpoznanie
                    nad całą Polską. Jedzie w tym samym obiekcie `kinds`. */}
                <Toggle
                  on={kinds.rare !== false}
                  onToggle={() => setKinds(prev => ({ ...prev, rare: prev.rare === false }))}
                  label={t('RARE_LABEL')}
                  title={t('RARE_HINT')}
                  marker={<span className="toggle-ico"><IconRadar /></span>}
                  {...onOff(kinds.rare !== false)}
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
            marker={<span className="toggle-ico"><IconSound on={soundOn} /></span>}
            {...onOff(soundOn)}
          />
          {'vibrate' in navigator && (
            <Toggle
              on={vibrateOn}
              onToggle={() => setVibrateOn(v => !v)}
              label={t('VIBRATION_LABEL')}
              marker={<span className="toggle-ico"><IconVibrate /></span>}
              {...onOff(vibrateOn)}
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
                marker={<span className="toggle-ico"><IconLanding /></span>}
                {...onOff(on)}
              />
            )
          })}
        </div>
      </section>

      {children}
    </div>
  )
}
