import { t } from '../i18n'
import UsageStats from './UsageStats'
import Toggle, { onOff } from './Toggle'
import { IconPulse, IconChart } from './UiIcons'

// Nazwy problemów z lib/health.js (serwer).
const HEALTH_LABELS = {
  tick: 'zadania ticka',
  sources: 'źródła danych',
  worker: 'cron na Cloudflare',
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

// Stopka panelu Alerty — wersja i ukryta diagnostyka. Dawniej osobny panel
// Ustawienia, który po usunięciu sekcji GPS nie miał już nic poza tym.
export default function PanelFooter({
  location,
  radius, isSubscribed,
  error,
  debugUnlocked, debugOpen, setDebugOpen, handleTestPush, testPushStatus, syncError, serverStatus,
  healthAlerts, setHealthAlerts,
  version, bumpVersionTap,
}) {

  return (
    <>
      {error && <p className="err small">✗ {error}</p>}

      {/* Statystyki — zwijana sekcja na dole panelu (odblokowana trzema
          stuknięciami w wersję). */}
      {debugUnlocked && (
        <button className="stats-toggle" onClick={() => setDebugOpen(o => !o)} aria-expanded={debugOpen}>
          <span className="stats-toggle__label"><IconChart size={16} /> {t('DEBUG_TOGGLE')}</span>
          <span className="stats-toggle__chev" aria-hidden="true">{debugOpen ? '▴' : '▾'}</span>
        </button>
      )}

      {debugUnlocked && debugOpen && (
        <div className="debug-body">
          <UsageStats />

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
              <div className="cp-label">{t('HEALTH_LABEL')}</div>
              <div className="toggle-list">
                <Toggle
                  on={healthAlerts}
                  onToggle={() => setHealthAlerts(v => !v)}
                  label={t('HEALTH_TOGGLE')}
                  title={t('HEALTH_HINT')}
                  marker={<span className="toggle-ico"><IconPulse /></span>}
                  {...onOff(healthAlerts)}
                />
              </div>
              {Array.isArray(serverStatus?.health) && (
                serverStatus.health.length === 0
                  ? <p className="ok small mt6">◉ {t('HEALTH_ALL_OK')}</p>
                  : serverStatus.health.map(h => (
                      <p key={h.id} className="err small mt6 break">
                        ✗ {HEALTH_LABELS[h.id] || h.id} · od {formatAge(Date.now() - h.since)}: {h.detail}
                      </p>
                    ))
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

      {/* Wersja zawsze na samym dole panelu — także przy krótkiej treści
          (panel-body--footer to kolumna, a ta stopka ma margin-top: auto). */}
      <div className="panel-version">
        <button className="panel-version__btn" onClick={bumpVersionTap} title={debugUnlocked ? 'Statystyki odblokowane' : ''}>
          v{version} · {__BUILD_STAMP__}
        </button>
      </div>
    </>
  )
}
