// HTML dymka lotniska (Leaflet bindPopup przyjmuje tekst, nie komponent).
// Liczone w chwili otwarcia — dymek to migawka, nie żywy widok.

import { basePlan } from '../lib/baseSummary'
import { t } from '../i18n'

const timeFmt = new Intl.DateTimeFormat('pl-PL', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw',
})

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))

export function basePopupHtml(base, variant, { zones, zonesError, now }) {
  const parts = [
    `<div class="base-pop">`,
    `<div class="base-pop__title">${esc(base.name)} <span class="base-pop__icao">${esc(base.icao)}</span></div>`,
  ]

  // Plan PAŻP dotyczy tylko polskich baz — bazy NATO w nim nie występują.
  if (variant === 'pl') {
    parts.push(`<div class="base-pop__head">${t('BASE_PLAN_TITLE')}</div>`)
    if (!zones) {
      // Rozróżniamy „jeszcze nie przyszło" od „nie przyjdzie": przy awarii
      // PAŻP dymek mówił „Wczytywanie planu…" bez końca.
      parts.push(`<div class="base-pop__empty">${zonesError ? t('BASE_PLAN_ERROR') : t('BASE_PLAN_LOADING')}</div>`)
    } else {
      const plan = basePlan(base.icao, zones, now)
      if (!plan.length) parts.push(`<div class="base-pop__empty">${t('BASE_PLAN_EMPTY')}</div>`)
      for (const r of plan) {
        const who = r.who.length ? r.who.join(', ') : '—'
        parts.push(
          `<div class="base-pop__row${r.active ? ' is-active' : ''}">` +
          `<span class="base-pop__time">${timeFmt.format(r.s)}–${timeFmt.format(r.e)}</span>` +
          `<span class="base-pop__who">${esc(who)}</span>` +
          `<span class="base-pop__zones">${esc(r.zones.join(', '))}${r.active ? ` · ${t('BASE_NOW')}` : ''}</span>` +
          `</div>`
        )
      }
    }
  }

  parts.push(`</div>`)
  return parts.join('')
}
