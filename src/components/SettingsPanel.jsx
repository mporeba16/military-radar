import Toggle from './Toggle'
import { t } from '../i18n'
import { RANGE_ANCHORS, RANGE_SEG, rangePosToKm, rangeKmToPos } from '../lib/range'

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

// Panel „Ustawienia": GPS, zasięg, filtry kategorii, powiadomienia + (po
// odblokowaniu) sekcje debug. Wydzielony z App.jsx — App został kontenerem
// stanu, a cały JSX panelu mieszka tutaj.
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
  return (
    <div className="panel-body">
      {/* 1. GPS — fundament wszystkiego. Karta statusu: zielona gdy jest
          pozycja, czerwony alarm gdy brak (bez GPS alerty nie działają). */}
      <section className="cp-section">
        <div className={`gps-card ${location ? 'gps-ok' : locationError ? 'gps-off' : 'gps-wait'}`}>
          <div className="cp-label" style={{ marginBottom: 7 }}>{t('GPS_LABEL')}</div>
          {location
            ? <>
                <p className="ok" style={{ fontSize: 16, letterSpacing: 0.5 }}>
                  ◉ {location.lat.toFixed(4)}°N {location.lon.toFixed(4)}°E
                </p>
                {accuracy != null && (
                  <p className="info-text" style={{ fontSize: 10, marginTop: 3 }}>
                    {t('GPS_ACCURACY')} ±{accuracy < 1000 ? `${Math.round(accuracy)} m` : `${(accuracy / 1000).toFixed(1)} km`}
                  </p>
                )}
              </>
            : locationError
              ? <>
                  {/* Twardy stan: odmowa zgody albo poddanie się po próbach */}
                  <div className="gps-alarm-head">⚠ {t('GPS_OFF_TITLE')}</div>
                  {locationError === 'Brak zgody na lokalizację'
                    ? <p className="gps-alarm-text">{t('GPS_DENIED_HINT')}</p>
                    : <>
                        <p className="gps-alarm-text">{t('GPS_OFF_DESC')}</p>
                        <button className="btn-gps-fix" onClick={requestLocation}>◎ {t('GPS_RETRY')}</button>
                      </>}
                </>
              : <>
                  {/* Stan przejściowy — szukamy fixa (np. kCLErrorLocationUnknown) */}
                  <p className="gps-wait-text">◌ {t('GPS_SEARCHING')}</p>
                  <button className="link-btn" style={{ marginTop: 6 }} onClick={requestLocation}>{t('GPS_RETRY')}</button>
                </>}
        </div>
      </section>

      {/* 2. Zasięg alertów */}
      <section className="cp-section">
        <div className="cp-label">{t('RANGE_LABEL')}: <strong style={{ color: '#fff' }}>{radius} km</strong></div>
        <input type="range" min="0" max={(RANGE_ANCHORS.length - 1) * RANGE_SEG} step="1"
          value={rangeKmToPos(radius)} aria-label={t('RANGE_LABEL')}
          onChange={e => setRadius(rangePosToKm(Number(e.target.value)))} className="range-slider" />
        <div className="range-marks">{RANGE_ANCHORS.map(a => <span key={a}>{a}</span>)}</div>
        {location && (
          <p className="info-text" style={{ marginTop: 6 }}>
            {t('IN_RANGE_NOW')} <strong style={{ color: inRangeCount > 0 ? '#ff5520' : '#00ff88' }}>
              {inRangeCount} {t('PLANES')}
            </strong>
            {inRangeCount > alertsCount && (
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {' '}({t('VISIBLE_ALERTS')} {alertsCount})
              </span>
            )}
          </p>
        )}
      </section>

      {/* 3. Filtr kategorii — co pokazywać na mapie */}
      <section className="cp-section">
        <div className="cp-label">{t('FILTER_LABEL')}</div>
        <div className="toggle-list">
          {[
            { key: 'mil', label: t('FILTER_MIL'), color: '#00ff88' },
            { key: 'heli', label: t('FILTER_HELI'), color: '#00d9ff' },
            { key: 'heavy', label: t('FILTER_HEAVY'), color: '#ffb300' },
          ].map(({ key, label, color }) => (
            <Toggle
              key={key}
              on={kinds[key]}
              onToggle={() => setKinds(prev => ({ ...prev, [key]: !prev[key] }))}
              label={label}
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

      {/* 4. Powiadomienia push */}
      <section className="cp-section">
        <div className="cp-label">{t('PUSH_LABEL')}</div>
        {permissionState === 'unsupported'
          ? <p className="info-text">{IS_IOS && !isStandalonePWA() ? t('PUSH_IOS_INSTALL') : t('PUSH_UNSUPPORTED')}</p>
          : permissionState === 'denied'
            ? <p className="err" style={{ fontSize: 11 }}>{t('PUSH_DENIED')}</p>
            : isSubscribed
              ? <>
                  <p className="ok">{t('PUSH_ACTIVE')}</p>
                  <button className="link-btn" style={{ marginTop: 4 }} onClick={unsubscribe}>
                    {t('PUSH_DISABLE')}
                  </button>
                </>
              : <>
                  <button className="btn-subscribe" onClick={subscribe} disabled={isSubscribing}>
                    {isSubscribing ? t('PUSH_CONNECTING') : t('PUSH_ENABLE')}
                  </button>
                  {subscribeError && <p className="err" style={{ fontSize: 11, marginTop: 6 }}>✗ {subscribeError}</p>}
                </>
        }
        <p className="info-text" style={{ marginTop: 6 }}>
          {t('PUSH_DESCRIPTION')}
        </p>

        <div className="cp-sublabel">{t('IN_APP_LABEL')}</div>
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

      {error && <p className="err" style={{ fontSize: 11, marginTop: 8 }}>✗ {error}</p>}

      {/* Debug sections — gated behind 3× tap on the version footer or
          ?debug=1 in the URL. Hidden by default to keep the panel
          clean for normal users. */}
      {debugUnlocked && (
        <>
          <div className="cp-label" style={{ marginTop: 18, color: '#ffb74d' }}>🔧 DEBUG</div>

          <section className="cp-section cp-refresh">
            <button className="btn-refresh" onClick={fetchData}>{t('REFRESH_BTN')}</button>
          </section>

          {isSubscribed && (
            <section className="cp-section">
              <div className="cp-label">{t('TEST_PUSH_LABEL')}</div>
              <button
                className="btn-refresh"
                onClick={handleTestPush}
                disabled={testPushStatus?.kind === 'loading'}>
                {testPushStatus?.kind === 'loading' ? t('TEST_PUSH_SENDING') : t('TEST_PUSH_BTN')}
              </button>
              {testPushStatus?.kind === 'ok' && (
                <p className="ok" style={{ fontSize: 11, marginTop: 6 }}>{t('TEST_PUSH_OK')}</p>
              )}
              {testPushStatus?.kind === 'err' && (
                <p className="err" style={{ fontSize: 11, marginTop: 6, wordBreak: 'break-all' }}>
                  ✗ {testPushStatus.detail}
                </p>
              )}
            </section>
          )}

          {isSubscribed && (
            <section className="cp-section">
              <div className="cp-label">{t('SERVER_POSITION_LABEL')}</div>
              {location
                ? <p className="ok" style={{ fontSize: 11 }}>◉ {location.lat.toFixed(4)}°N {location.lon.toFixed(4)}°E · {radius} km</p>
                : <p className="err" style={{ fontSize: 11 }}>{t('SERVER_NO_GPS')}</p>
              }
              {syncError && (
                <p className="err" style={{ fontSize: 11, marginTop: 6 }}>
                  {t('SERVER_SYNC_ERROR')} {syncError}
                </p>
              )}
            </section>
          )}

          {isSubscribed && (
            <section className="cp-section">
              <div className="cp-label">{t('SERVER_DIAG_LABEL')}</div>
              {!serverStatus
                ? <p className="info-text" style={{ fontSize: 11 }}>{t('DIAG_FETCHING')}</p>
                : <div style={{ fontSize: 11, fontFamily: "'Courier New', monospace", lineHeight: 1.7 }}>
                    <div className={serverStatus.ok ? 'ok' : 'err'}>
                      {serverStatus.ok ? '◉' : '✗'} {' '}
                      {serverStatus.reason === 'ready' && t('DIAG_READY')}
                      {serverStatus.reason === 'no-gps' && t('DIAG_NO_GPS')}
                      {serverStatus.reason === 'stale-gps' && t('DIAG_STALE')}
                      {serverStatus.reason === 'not-registered' && t('DIAG_NOT_REGISTERED')}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.55)' }}>
                      Provider: <span style={{ color: '#fff' }}>{serverStatus.provider}</span>
                      {serverStatus.provider === 'apple' && ' (iOS APNS)'}
                    </div>
                    {serverStatus.gpsAgeMs != null && (
                      <div style={{ color: 'rgba(255,255,255,0.55)' }}>
                        Wiek GPS: <span style={{ color: '#fff' }}>{formatAge(serverStatus.gpsAgeMs)}</span>
                      </div>
                    )}
                    {serverStatus.server && (
                      <>
                        <div style={{ color: 'rgba(255,255,255,0.55)' }}>
                          VAPID skonfig.: <span className={serverStatus.server.vapidConfigured ? 'ok' : 'err'}>
                            {serverStatus.server.vapidConfigured ? 'tak' : 'NIE'}
                          </span>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.55)', wordBreak: 'break-all' }}>
                          VAPID subject: <span style={{ color: '#fff' }}>{serverStatus.server.vapidSubject}</span>
                        </div>
                      </>
                    )}
                    {serverStatus.storeErrors && serverStatus.storeErrors.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div className="err">Błędy blob store:</div>
                        {serverStatus.storeErrors.map((e, i) => (
                          <div key={i} className="err" style={{ fontSize: 10, wordBreak: 'break-all' }}>· {e}</div>
                        ))}
                      </div>
                    )}
                    {serverStatus.latestRun && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ color: 'rgba(255,255,255,0.55)' }}>Ostatni cron:</div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>
                          {new Date(serverStatus.latestRun.startedAt).toLocaleString('pl-PL')}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.55)' }}>
                          Subskrypcji: <span style={{ color: '#fff' }}>{serverStatus.latestRun.totalSubs}</span>
                          {' · '}
                          Wysłano: <span style={{ color: '#fff' }}>{serverStatus.latestRun.notificationsSent}</span>
                          {' · '}
                          Błędów: <span className={serverStatus.latestRun.pushErrors > 0 ? 'err' : ''}>{serverStatus.latestRun.pushErrors}</span>
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
        </>
      )}

      {/* Footer — 3× tap on the version unlocks debug sections above */}
      <p
        className="info-text"
        style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, cursor: 'pointer', userSelect: 'none' }}
        onClick={bumpVersionTap}
        title={debugUnlocked ? 'Debug aktywny' : ''}>
        v{version}{debugUnlocked && ' · 🔧'}
      </p>
    </div>
  )
}
