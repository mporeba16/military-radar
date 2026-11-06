// Anonimowy licznik użytkowników: ile urządzeń otworzyło aplikację danego
// dnia, w tygodniu i w miesiącu, na jakich platformach i z jakich miast.
//
// Aplikacja wysyła raz na dobę losowy identyfikator urządzenia (ten sam, co
// przy subskrypcji push, z localStorage). Zapisujemy wyłącznie jego skrót
// z solą — z zapisu nie da się wrócić do identyfikatora ani powiązać go
// z subskrypcją. Miasto i kraj pochodzą z geolokalizacji Netlify (ustalanej
// po adresie IP, przybliżonej); samego adresu IP nie zapisujemy. Bez
// ciasteczek i zewnętrznych usług.
//
// Układ w Blobs: `usage/<dzień>/<skrót>` →
//   { standalone, push, platform, city, country, at }.
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

// Przybliżone położenie z nagłówka `x-nf-geo`, który Netlify dokleja do
// zapytań do funkcji (base64 z JSON-em: miasto, kraj, region). Tylko miasto
// i kod kraju; brak nagłówka albo śmieci → null.
export function geoFromHeaders(headers = {}) {
  const raw = headers['x-nf-geo'] || headers['X-Nf-Geo']
  let geo = null
  try { geo = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) : null } catch { /* brak */ }
  const city = typeof geo?.city === 'string' ? geo.city.slice(0, 60) : null
  const code = geo?.country?.code || headers['x-country'] || null
  const country = typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? code : null
  return city || country ? { city, country } : null
}

// Rekord z ciała zapytania — tylko znane pola i wartości — plus położenie
// i chwila sygnału (pierwsze otwarcie aplikacji tego dnia).
export function usageRecord(body, geo = null, now = Date.now()) {
  return {
    standalone: body?.standalone === true,
    push: body?.push === true,
    platform: PLATFORMS.has(body?.platform) ? body.platform : 'other',
    city: geo?.city ?? null,
    country: geo?.country ?? null,
    at: now,
  }
}

// Ostatnie `n` dni (z dzisiejszym), od najnowszego.
export function lastDays(n, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => warsawDay(now - i * 86_400_000))
}

const emptyPlatforms = () => ({ ios: 0, android: 0, desktop: 0, other: 0 })

/**
 * Statystyki z listy kluczy `<dzień>/<skrót>` (unikalne urządzenia: dziś,
 * 7 i 30 dni) oraz rekordów z ostatnich 14 dni — z nich podział każdego dnia
 * na platformy do wykresu. `recordsByDay[dzień]` to lista rekordów
 * ({ platform, … }) tego dnia. Czysta funkcja.
 */
export function summarize(keysByDay, recordsByDay = {}, now = Date.now()) {
  const days = lastDays(30, now)
  const uniq = n => new Set(days.slice(0, n).flatMap(d => keysByDay[d] || [])).size
  return {
    day: days[0],
    dau: uniq(1),
    wau: uniq(7),
    mau: uniq(30),
    // Dzień po dniu z ostatnich 14 dni, z podziałem na platformy.
    daily: days.slice(0, 14).map(d => {
      const platform = emptyPlatforms()
      const devices = []
      for (const r of recordsByDay[d] || []) {
        const pl = PLATFORMS.has(r?.platform) ? r.platform : 'other'
        platform[pl]++
        // Lista urządzeń dnia — bez skrótu identyfikatora, tylko to, co widać.
        devices.push({ platform: pl, city: r?.city ?? null, country: r?.country ?? null, at: r?.at ?? null })
      }
      devices.sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
      return { day: d, n: (keysByDay[d] || []).length, platform, devices }
    }),
  }
}
