import { useState } from 'react'
import { threatStyle } from '../lib/threatLevels'
import { t } from '../i18n'

// Plakietka ryzyka dronowego pod znacznikiem aplikacji. Zwinięta pokazuje sam
// poziom; po dotknięciu rozwija się w listę „co go podniosło”, bo bez powodów
// kolorowa plama na mapie byłaby wróżeniem z fusów.
//
// Zastrzeżenie o tym, że to szacunek własny, a nie komunikat RCB, jest częścią
// rozwinięcia — nie stopką petitem. Ludzie potraktują to jak alert urzędowy,
// jeśli im tego wprost nie odbierzemy.
export default function ThreatBadge({ threat, error }) {
  const [open, setOpen] = useState(false)

  if (!threat && !error) return null

  const level = threat?.level || 'calm'
  const { label, color } = threatStyle(level)
  const unavailable = !threat || threat.signals?.ua?.ok === false

  const raised = (threat?.regions || []).filter(r => r.level !== 'calm')
  const uaAlerts = threat?.signals?.ua?.alerts || []

  return (
    <div className={`threat-badge${open ? ' open' : ''}`}>
      <button
        className="threat-badge__chip"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        title={t('THREAT_TITLE')}
        style={level === 'calm' || error ? undefined : {
          background: `color-mix(in srgb, ${color} 22%, rgba(4, 10, 20, 0.95))`,
          borderTopColor: color,
        }}>
        <span className="threat-badge__dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span className="threat-badge__cap">{t('THREAT_CAP')}</span>
        <span className="threat-badge__level" style={{ color }}>
          {error ? t('THREAT_UNKNOWN') : label}
        </span>
        <span className="threat-badge__chev">{open ? '⌄' : '⌃'}</span>
      </button>

      {open && (
        <div className="threat-badge__body">
          {/* Przewija się sama lista powodów. Zastrzeżenie zostaje przypięte pod
              nią, bo to jedyne zdanie, które MUSI być widoczne od razu — gdyby
              jechało razem z treścią, przy dłuższej liście znikałoby poza
              krawędzią i zostawałaby sama kolorowa ocena. */}
          <div className="threat-badge__scroll">
          {error && <div className="threat-badge__warn">{t('THREAT_FETCH_ERROR')}</div>}
          {!error && unavailable && (
            <div className="threat-badge__warn">{t('THREAT_UA_DOWN')}</div>
          )}

          {uaAlerts.length > 0 && (
            <div className="threat-badge__row">
              <span className="threat-badge__key">{t('THREAT_UA_LABEL')}</span>
              <span>{uaAlerts.map(a => `obwód ${a.pl}`).join(', ')}</span>
            </div>
          )}

          {raised.length > 0 ? (
            <ul className="threat-badge__regions">
              {raised.map(r => {
                const rs = threatStyle(r.level)
                return (
                  <li key={r.id}>
                    <span className="threat-badge__region" style={{ color: rs.color }}>
                      {r.name} · {rs.short}
                    </span>
                    {r.reasons.length > 0 && (
                      <span className="threat-badge__reasons">{r.reasons.join(' · ')}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : !error && (
            <div className="threat-badge__row threat-badge__quiet">{t('THREAT_NONE')}</div>
          )}

          {threat?.signals?.adsb?.ok && (
            <div className="threat-badge__row threat-badge__quiet">
              {t('THREAT_ADSB_LABEL')} {threat.signals.adsb.milOverPoland}
              {threat.signals.adsb.baseline != null && ` (norma ~${threat.signals.adsb.baseline})`}
            </div>
          )}

          </div>

          <p className="threat-badge__disclaimer">{threat?.disclaimer || t('THREAT_DISCLAIMER')}</p>
        </div>
      )}
    </div>
  )
}
