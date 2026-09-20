import { useState } from 'react'
import { t } from '../i18n'
import { readViewportReport } from '../lib/viewportProbe'

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

// Wymiary okna odczytane na urządzeniu — jedyny sposób, żeby zobaczyć, co iOS
// naprawdę robi z trybem standalone i wcięciami bezpiecznymi.
function ViewportDiag() {
  const [rep, setRep] = useState(() => readViewportReport())
  const wiersz = (k, v) => (
    <div className="diag__row" key={k}>{k}: <span className="diag__v">{v}</span></div>
  )
  if (!rep) return null
  const { insets } = rep
  return (
    <section className="cp-section">
      <div className="cp-label">Okno</div>
      <div className="diag">
        {wiersz('standalone', rep.standalone ? 'tak' : 'NIE')}
        {wiersz('screenY', rep.screenY)}
        {wiersz('outerHeight', rep.outerH)}
        {wiersz('innerHeight', rep.innerH)}
        {wiersz('screen.height', rep.screenH)}
        {wiersz('visualViewport', rep.visualH)}
        {wiersz('clientHeight', rep.dvh)}
        {wiersz('.app', rep.appH)}
        {wiersz('mapa', rep.mapH)}
        {wiersz('wcięcia (g/d/l/p)', `${insets.top} / ${insets.bottom} / ${insets.left} / ${insets.right}`)}
        {wiersz('dpr', rep.dpr)}
        <button className="link-btn mt6" onClick={() => setRep(readViewportReport())}>Zmierz ponownie</button>
      </div>
    </section>
  )
}

// Panel Ustawienia — to, co otwiera się raz na jakiś czas: pozycja GPS,
// wersja i diagnostyka. Alerty i warstwy mają własne panele.
export default function SettingsPanel({
  location, accuracy, requestLocation,
  radius, isSubscribed,
  error,
  debugUnlocked, fetchData, handleTestPush, testPushStatus, syncError, serverStatus,
  version, bumpVersionTap,
}) {
  const [gpsOpen, setGpsOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)

  return (
    <div className="panel-body">

      {/* Pozycja GPS — współrzędne i dokładność. Brak GPS opisuje karta
          gotowości w panelu Alerty. */}
      <section className="cp-section">
        <div className="cp-label">{t('GPS_SECTION')}</div>
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
                <button className="link-btn" onClick={requestLocation}
                  title={t('GPS_LABEL')}>{t('GPS_RETRY')}</button>
              </div>
            )}
          </>
        ) : (
          // Bez pozycji panel nie może być pusty — powód i „co dalej" opisuje
          // karta gotowości w Alertach, tu zostaje sama możliwość ponowienia.
          <>
            <p className="info-text">{t('GPS_NONE')}</p>
            <button className="link-btn mt6" onClick={requestLocation}>{t('GPS_RETRY')}</button>
          </>
        )}
      </section>

      {error && <p className="err small">✗ {error}</p>}

      {/* Stopka: wersja, a diagnostyka jako zwijany wiersz obok niej — nie
          wciśnięta pomiędzy ustawienia, jak było wcześniej. */}
      <div className="panel-footer">
        <button className="panel-footer__ver" onClick={bumpVersionTap} title={debugUnlocked ? 'Debug aktywny' : ''}>
          v{version} · {__BUILD_STAMP__}
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

          <ViewportDiag />

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
