// Anonimowy licznik użytkowników: ile urządzeń otworzyło aplikację danego
// dnia, w tygodniu i w miesiącu, ile z nich ma ją zainstalowaną na ekranie
// głównym i włączone powiadomienia.
//
// Aplikacja wysyła raz na dobę losowy identyfikator urządzenia (ten sam, co
// przy subskrypcji push, z localStorage). Zapisujemy wyłącznie jego skrót
// z solą — z zapisu nie da się wrócić do identyfikatora ani powiązać go
// z subskrypcją. Bez ciasteczek, adresów IP i zewnętrznych usług.
//
// Układ w Blobs: `usage/<dzień>/<skrót>` → { standalone, push, platform }.
// Jeden wpis na urządzenie na dzień, ponowny sygnał tylko go nadpisuje.

import crypto from 'crypto'

export const USAGE_STORE = 'usage'
// Dłużej nie trzymamy — MAU potrzebuje 30 dni, reszta to zapas.
export const USAGE_KEEP_DAYS = 90
const SALT = process.env.USAGE_SALT || 'radar-usage-v1'

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' })

// Dzień w czasie polskim, „2026-11-02".
export function warsawDay(ms = Date.now()) {
  return dayFmt.format(ms)
}

export function deviceHash(id) {
  return crypto.createHash('sha256').update(`${SALT}:${id}`).digest('hex').slice(0, 20)
}

const PLATFORMS = new Set(['ios', 'android', 'desktop', 'other'])

// Rekord z ciała zapytania — tylko znane pola i wartości.
export function usageRecord(body) {
  return {
    standalone: body?.standalone === true,
    push: body?.push === true,
    platform: PLATFORMS.has(body?.platform) ? body.platform : 'other',
  }
}

// Ostatnie `n` dni (z dzisiejszym), od najnowszego.
export function lastDays(n, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => warsawDay(now - i * 86_400_000))
}

/**
 * Statystyki z listy kluczy `<dzień>/<skrót>` (bez czytania wartości) oraz
 * rekordów z ostatnich 7 dni (najnowszy na urządzenie) — do podziału na
 * instalację, powiadomienia i platformę. Czysta funkcja.
 */
export function summarize(keysByDay, recent7, now = Date.now()) {
  const days = lastDays(30, now)
  const uniq = n => new Set(days.slice(0, n).flatMap(d => keysByDay[d] || [])).size
  const breakdown = { standalone: 0, push: 0, platform: { ios: 0, android: 0, desktop: 0, other: 0 } }
  for (const r of recent7) {
    if (r.standalone) breakdown.standalone++
    if (r.push) breakdown.push++
    breakdown.platform[r.platform] = (breakdown.platform[r.platform] || 0) + 1
  }
  return {
    day: days[0],
    dau: uniq(1),
    wau: uniq(7),
    mau: uniq(30),
    // Dzień po dniu z ostatnich 14 dni — widać trend, a nie tylko jedną liczbę.
    daily: days.slice(0, 14).map(d => ({ day: d, n: (keysByDay[d] || []).length })),
    week: { devices: recent7.length, ...breakdown },
  }
}
