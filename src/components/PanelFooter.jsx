import { t } from '../i18n'
import UsageStats from './UsageStats'
import { IconChart } from './UiIcons'

// Stopka panelu Powiadomienia: zwijane Statystyki (odblokowane trzema
// stuknięciami w wersję) i wersja na samym dole. Diagnostyka serwera, testowy
// push i stan systemu zniknęły ze Statystyk (decyzja użytkownika 06.11.2026).
export default function PanelFooter({
  error, debugUnlocked, debugOpen, setDebugOpen, version, bumpVersionTap,
}) {
  return (
    <>
      {error && <p className="err small">✗ {error}</p>}

      {debugUnlocked && (
        <button className="expander stats-toggle" onClick={() => setDebugOpen(o => !o)} aria-expanded={debugOpen}>
          <span className="expander__label"><IconChart size={18} /> {t('DEBUG_TOGGLE')}</span>
          <span className="expander__chev" aria-hidden="true">{debugOpen ? '▴' : '▾'}</span>
        </button>
      )}

      {debugUnlocked && debugOpen && (
        <div className="debug-body">
          <UsageStats />
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
