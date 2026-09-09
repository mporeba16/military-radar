import { useState } from 'react'
import Toggle from './Toggle'
import RangeSlider from './RangeSlider'
import { t } from '../i18n'
import { planeWord } from '../lib/plural'

// iPadOS 13+ reports as "MacIntel" but has a touch screen — catch it too.
const IS_IOS = typeof navigator !== 'undefined' && (
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
)
function isStandalonePWA() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
}

function formatAge(ms) {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)} dni`
}

const KIND_ROWS = [
  { key: 'mil', labelKey: 'FILTER_MIL', color: '#00ff88' },
  { key: 'heli', labelKey: 'FILTER_HELI', color: '#00d9ff' },
  { key: 'heavy', labelKey: 'FILTER_HEAVY', color: '#ffb300' },
]

// Alerty wymagają trzech rzeczy naraz: pozycji, włączonego pusha i choćby
// jednej kategorii. Wcześniej trzeba było przeczytać cztery sekcje, żeby to
// złożyć — ten pasek odpowiada w jednym wierszu i nazywa brakujący warunek.
function readiness({ hasGps, pushOn, kindsOn }) {
  if (!hasGps) return { level: 'off', title: t('READY_NO_GPS'), why: t('READY_WHY_NO_GPS') }
  if (kindsOn === 0) return { level: 'warn', title: t('READY_MUTED'), why: t('READY_WHY_MUTED') }
  if (!pushOn) return { level: 'warn', title: t('READY_APP_ONLY'), why: t('READY_WHY_APP_ONLY') }
  return { level: 'ok', title: t('READY_OK'), why: null }
}

export default function SettingsPanel({
  location, accuracy, locationError, requestLocation,
  radius, setRadius, inRangeCount, alertsCount,
  kinds, setKinds,
  permissionState, isSubscribed, isSubscribing, subscribe, unsubscribe, subscribeError,
  soundOn, setSoundOn, vibrateOn, setVibrateOn,
  error,
  debugUnlocked, fetchData, handleTestPush, testPushStatus, syncError, serverStatus,
  version, bumpVersionTap,
}) {
  const [gpsOpen, setGpsOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)

  const kindsOn = KIND_ROWS.filter(k => kinds[k.key]).length
  const state = readiness({ hasGps: !!location, pushOn: isSubscribed, kindsOn })
  const pushUsable = permissionState !== 'unsupported' && permissionState !== 'denied'

  return (
    <div className="panel-body">

      {/* 1. Czy to w ogóle zadziała — odpowiedź zanim cokolwiek przewiniesz. */}
      <div className={`ready-card ready-${state.level}`}>
        <span className="ready-title">{state.level === 'ok' ? '◉' : '⚠'} {state.title}</span>
        {state.why && <span className="ready-why">{state.why}</span>}
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
                  marker={<span className="toggle-dot" style={{ background: '#00ff88' }} />}
                  state={t('SOUND_ON')}
                  stateColor="#00ff88"
                />
              </div>
            : <>
                <button className="btn-subscribe" onClick={subscribe} disabled={isSubscribing}>
                  {isSubscribing ? t('PUSH_CONNECTING') : t('PUSH_ENABLE')}
                </button>
                {subscribeError && <p className="err small mt6">✗ {subscribeError}</p>}
              </>
        }
        <p className="info-text mt6">{t('PUSH_DESCRIPTION')}</p>
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

      {/* 5. Kategorie — sterują mapą i powiadomieniami naraz. */}
      <section className="cp-section">
        <div className="cp-label">{t('FILTER_LABEL')}</div>
        <p className="info-text">{t('FILTER_HINT')}</p>
        <div className="toggle-list">
          {KIND_ROWS.map(({ key, labelKey, color }) => (
            <Toggle
              key={key}
              on={kinds[key]}
              onToggle={() => setKinds(prev => ({ ...prev, [key]: !prev[key] }))}
              label={t(labelKey)}
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

      {/* 6. GPS — duża karta alarmowa tylko wtedy, gdy coś nie gra. */}
      <section className="cp-section">
        {location ? (
          <>
            <button className="gps-slim" onClick={() => setGpsOpen(o => !o)} aria-expanded={gpsOpen}>
              <span className="gps-slim__dot">◉</span>
              <span className="gps-slim__coord">{location.lat.toFixed(4)}°N {location.lon.toFixed(4)}°E</span>
              <span className="gps-slim__meta">
                {accuracy != null && `±${accuracy < 1000 ? `${Math.round(accuracy)} m` : `${(accuracy / 1000).toFixed(1)} km`}`}
              </span>
              <span className="gps-slim__chev">{gpsOpen ? '⌃' : '⌄'}</span>
            </button>
            {gpsOpen && (
              <div className="gps-more">
                <p className="info-text">{t('GPS_LABEL')}</p>
                <button className="link-btn" onClick={requestLocation}>{t('GPS_RETRY')}</button>
              </div>
            )}
          </>
        ) : (
          <div className={`gps-card ${locationError ? 'gps-off' : 'gps-wait'}`}>
            {locationError ? (
              <>
                <div className="gps-alarm-head">⚠ {t('GPS_OFF_TITLE')}</div>
                {locationError === 'Brak zgody na lokalizację'
                  ? <p className="gps-alarm-text">{t('GPS_DENIED_HINT')}</p>
                  : <>
                      <p className="gps-alarm-text">{t('GPS_OFF_DESC')}</p>
                      <button className="btn-gps-fix" onClick={requestLocation}>◎ {t('GPS_RETRY')}</button>
                    </>}
              </>
            ) : (
              <>
                <p className="gps-wait-text">◌ {t('GPS_SEARCHING')}</p>
                <button className="link-btn" onClick={requestLocation}>{t('GPS_RETRY')}</button>
              </>
            )}
          </div>
        )}
      </section>

      {error && <p className="err small">✗ {error}</p>}

      {/* Stopka: wersja, a diagnostyka jako zwijany wiersz obok niej — nie
          wciśnięta pomiędzy ustawienia, jak było wcześniej. */}
      <div className="panel-footer">
        <button className="panel-footer__ver" onClick={bumpVersionTap} title={debugUnlocked ? 'Debug aktywny' : ''}>
          v{version}
        </button>
        {debugUnlocked && (
          <button className="panel-footer__dbg" onClick={() => setDebugOpen(o => !o)} aria-expanded={debugOpen}>
            🔧 {t('DEBUG_TOGGLE')} {debugOpen ? '⌃' : '⌄'}
          </button>
        )}
      </div>

      {debugUnlocked && debugOpen && (
        <div className="debug-body">
          <section className="cp-section">
            <button className="btn-refresh" onClick={fetchData}>{t('REFRESH_BTN')}</button>
          </section>

          {isSubscribed && (
            <section className="cp-section">
              <div className="cp-label">{t('TEST_PUSH_LABEL')}</div>
              <button className="btn-refresh" onClick={handleTestPush}
                disabled={testPushStatus?.kind === 'loading'}>
                {testPushStatus?.kind === 'loading' ? t('TEST_PUSH_SENDING') : t('TEST_PUSH_BTN')}
              </button>
              {testPushStatus?.kind === 'ok' && <p className="ok small mt6">{t('TEST_PUSH_OK')}</p>}
              {testPushStatus?.kind === 'err' && (
                <p className="err small mt6 break">✗ {testPushStatus.detail}</p>
              )}
            </section>
          )}

          {isSubscribed && (
            <section className="cp-section">
              <div className="cp-label">{t('SERVER_POSITION_LABEL')}</div>
              {location
                ? <p className="ok small">◉ {location.lat.toFixed(4)}°N {location.lon.toFixed(4)}°E · {radius} km</p>
                : <p className="err small">{t('SERVER_NO_GPS')}</p>}
              {syncError && <p className="err small mt6">{t('SERVER_SYNC_ERROR')} {syncError}</p>}
            </section>
          )}

          {isSubscribed && (
            <section className="cp-section">
              <div className="cp-label">{t('SERVER_DIAG_LABEL')}</div>
              {!serverStatus
                ? <p className="info-text small">{t('DIAG_FETCHING')}</p>
                : <div className="diag">
                    <div className={serverStatus.ok ? 'ok' : 'err'}>
                      {serverStatus.ok ? '◉' : '✗'}{' '}
                      {serverStatus.reason === 'ready' && t('DIAG_READY')}
                      {serverStatus.reason === 'no-gps' && t('DIAG_NO_GPS')}
                      {serverStatus.reason === 'stale-gps' && t('DIAG_STALE')}
                      {serverStatus.reason === 'not-registered' && t('DIAG_NOT_REGISTERED')}
                    </div>
                    <div className="diag__row">
                      Provider: <span className="diag__v">{serverStatus.provider}</span>
                      {serverStatus.provider === 'apple' && ' (iOS APNS)'}
                    </div>
                    {serverStatus.gpsAgeMs != null && (
                      <div className="diag__row">Wiek GPS: <span className="diag__v">{formatAge(serverStatus.gpsAgeMs)}</span></div>
                    )}
                    {serverStatus.server && (
                      <>
                        <div className="diag__row">
                          VAPID skonfig.: <span className={serverStatus.server.vapidConfigured ? 'ok' : 'err'}>
                            {serverStatus.server.vapidConfigured ? 'tak' : 'NIE'}
                          </span>
                        </div>
                        <div className="diag__row break">
                          VAPID subject: <span className="diag__v">{serverStatus.server.vapidSubject}</span>
                        </div>
                      </>
                    )}
                    {serverStatus.storeErrors?.length > 0 && (
                      <div className="mt6">
                        <div className="err">Błędy blob store:</div>
                        {serverStatus.storeErrors.map((e, i) => (
                          <div key={i} className="err small break">· {e}</div>
                        ))}
                      </div>
                    )}
                    {serverStatus.latestRun && (
                      <div className="diag__run">
                        <div className="diag__row">Ostatni cron:</div>
                        <div className="diag__ts">
                          {new Date(serverStatus.latestRun.startedAt).toLocaleString('pl-PL')}
                        </div>
                        <div className="diag__row">
                          Subskrypcji: <span className="diag__v">{serverStatus.latestRun.totalSubs}</span>
                          {' · '}Wysłano: <span className="diag__v">{serverStatus.latestRun.notificationsSent}</span>
                          {' · '}Błędów: <span className={serverStatus.latestRun.pushErrors > 0 ? 'err' : ''}>
                            {serverStatus.latestRun.pushErrors}
                          </span>
                        </div>
                        {serverStatus.latestRun.skippedNoGps > 0 && (
                          <div className="err">Pominięto (brak GPS): {serverStatus.latestRun.skippedNoGps}</div>
                        )}
                        {serverStatus.latestRun.skippedStaleGps > 0 && (
                          <div className="err">Pominięto (stary GPS): {serverStatus.latestRun.skippedStaleGps}</div>
                        )}
                      </div>
                    )}
                  </div>
              }
            </section>
          )}
        </div>
      )}
    </div>
  )
}
