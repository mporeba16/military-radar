// Minimal i18n — picks language from localStorage override or browser, falls
// back to English. PL is the original/primary translation, EN is for everyone
// else. Add more languages by extending the STRINGS table.

const STRINGS = {
  pl: {
    APP_TITLE: 'RADAR WOJSKOWY',
    NAV_SETTINGS: 'USTAW',
    NAV_MAPS: 'MAPY',
    PANEL_SETTINGS: 'USTAWIENIA',
    PANEL_MAPS: 'MAPY',
    LOADING_AIRCRAFT: '◌ Ładowanie samolotów…',
    NO_AIRCRAFT: 'Brak samolotów wojskowych na mapie',
    GPS_LABEL: 'GPS — wymagany do alertów',
    GPS_WAITING: 'Oczekiwanie na GPS…',
    GPS_FETCH: 'Pobierz lokalizację',
    GPS_RETRY: 'Spróbuj ponownie',
    GPS_DENIED_HINT: 'Włącz lokalizację w ustawieniach (iOS Safari: Ustawienia → Witryny → Lokalizacja).',
    GPS_ACCURACY: 'dokładność',
    RANGE_LABEL: 'ZASIĘG ALERTÓW',
    IN_RANGE_NOW: 'W zasięgu teraz:',
    PLANES: 'samolotów',
    VISIBLE_ALERTS: 'widocznych alertów:',
    PUSH_LABEL: 'POWIADOMIENIA PUSH',
    PUSH_UNSUPPORTED: 'Przeglądarka nie obsługuje push notifications.',
    PUSH_DENIED: '✗ Zablokowane — odblokuj w ustawieniach przeglądarki',
    PUSH_ACTIVE: '◉ Powiadomienia aktywne',
    PUSH_ENABLE: 'Włącz powiadomienia',
    PUSH_CONNECTING: '◌ Łączenie…',
    PUSH_DESCRIPTION: 'Alert gdy wojskowy samolot pojawi się w zasięgu GPS — nawet gdy aplikacja jest zamknięta. Sprawdzane co 5 minut przez serwer.',
    TEST_PUSH_LABEL: 'TESTOWY PUSH',
    TEST_PUSH_BTN: '⚠ Wyślij testowy push z serwera',
    TEST_PUSH_SENDING: '◌ Wysyłanie…',
    TEST_PUSH_OK: '◉ Wysłane. Jeśli nie dostałeś powiadomienia — problem z APNS/iOS.',
    SERVER_POSITION_LABEL: 'POZYCJA NA SERWERZE',
    SERVER_NO_GPS: '✗ Brak GPS — serwer nie wyśle alertów bez pozycji.',
    SERVER_SYNC_ERROR: '✗ Błąd synchronizacji z serwerem:',
    SERVER_DIAG_LABEL: 'DIAGNOSTYKA SERWERA',
    DIAG_FETCHING: '◌ Pobieranie statusu…',
    DIAG_READY: 'Gotowe do wysyłki',
    DIAG_NO_GPS: 'Brak GPS na serwerze',
    DIAG_STALE: 'Pozycja >7 dni (przeterminowana)',
    DIAG_NOT_REGISTERED: 'Subskrypcja nie zapisana!',
    DIAG_PROVIDER: 'Provider:',
    DIAG_GPS_AGE: 'Wiek GPS:',
    DIAG_VAPID: 'VAPID skonfig.:',
    DIAG_VAPID_SUBJECT: 'VAPID subject:',
    DIAG_STORE_ERRORS: 'Błędy blob store:',
    DIAG_LAST_RUN: 'Ostatni cron:',
    DIAG_SUBSCRIPTIONS: 'Subskrypcji:',
    DIAG_SENT: 'Wysłano:',
    DIAG_ERRORS: 'Błędów:',
    DIAG_SKIPPED_NO_GPS: 'Pominięto (brak GPS):',
    DIAG_SKIPPED_STALE: 'Pominięto (stary GPS):',
    ALTITUDE_LABEL: 'SKALA WYSOKOŚCI',
    REFRESH_BTN: '↻ Odśwież',
    SETTINGS_FOOTER: 'Jeśli alerty nie działają: zamknij i otwórz app ponownie (wymuś odświeżenie).',
    SELECT_MAP: 'WYBIERZ MAPĘ',
    LANGUAGE_LABEL: 'JĘZYK',
    LANG_PL: 'Polski',
    LANG_EN: 'English',
    ALERT_TAG: '⚠ W ZASIĘGU',
    ALERT_OVERFLOW: 'więcej w zasięgu',
    INFO_TYPE: 'Typ',
    INFO_OPERATOR: 'Operator',
    INFO_DISTANCE: 'Odległość',
    INFO_PROGRESS: 'Przebieg',
    INFO_ALTITUDE: 'Wysokość',
    INFO_PHASE: 'Faza',
    INFO_VS: 'V/S',
    INFO_SPEED: 'Prędkość',
    INFO_COUNTRY: 'Kraj',
    INFO_ON_RADAR: 'Na radarze',
    INFO_TRAIL: 'Trasa:',
    INFO_TRAIL_PTS: 'pkt',
    PHOTO_NOT_FOUND: '🛩 Brak zdjęcia w planespotters.net',
    PHOTO_ERROR: '⚠ Nie udało się pobrać zdjęcia (sieć / timeout)',
    EXT_LINK: 'Otwórz w ADS-B Exchange ↗',
    APPROACH_LEAVING: 'Oddala się',
    APPROACH_FAR: 'Zbliża się · ponad 60 min',
    APPROACH_OVERHEAD: 'bezpośrednio nad Tobą',
    PHASE_GROUND: 'Na ziemi',
    PHASE_TAKEOFF: 'Wznosi się po starcie',
    PHASE_APPROACH: 'Podejście do lądowania',
    PHASE_CLIMB: 'Wznoszenie',
    PHASE_DESCEND: 'Zniżanie',
    PHASE_CRUISE: 'Przelot',
    CLOSE: 'Zamknij',
    CLOSE_PANEL: 'Zamknij panel',
    CLOSE_AIRCRAFT_PANEL: 'Zamknij panel samolotu',
    DISMISS_NOTIFICATION: 'Odrzuć powiadomienie',
    UPDATE_AVAILABLE: '◉ Nowa wersja dostępna',
    UPDATE_RELOAD: 'Przeładuj',
    BOOT_ERROR_TITLE: '⚠ Aplikacja nie odpowiada',
    BOOT_ERROR_HINT: 'Sprawdź połączenie i przeładuj stronę.',
    NOTIF_TITLE: 'Wojskowy samolot w zasięgu!',
    NOTIF_TITLE_NEAR: 'Wojskowy samolot blisko Ciebie!',
    NOTIF_UNKNOWN_TYPE: 'nieznany typ',
    NOTIF_SHOW: 'Pokaż na mapie',
  },
  en: {
    APP_TITLE: 'MILITARY RADAR',
    NAV_SETTINGS: 'SETTINGS',
    NAV_MAPS: 'MAPS',
    PANEL_SETTINGS: 'SETTINGS',
    PANEL_MAPS: 'MAPS',
    LOADING_AIRCRAFT: '◌ Loading aircraft…',
    NO_AIRCRAFT: 'No military aircraft on the map',
    GPS_LABEL: 'GPS — required for alerts',
    GPS_WAITING: 'Waiting for GPS…',
    GPS_FETCH: 'Get location',
    GPS_RETRY: 'Try again',
    GPS_DENIED_HINT: 'Enable location in your browser settings (iOS Safari: Settings → Websites → Location).',
    GPS_ACCURACY: 'accuracy',
    RANGE_LABEL: 'ALERT RANGE',
    IN_RANGE_NOW: 'In range now:',
    PLANES: 'aircraft',
    VISIBLE_ALERTS: 'visible alerts:',
    PUSH_LABEL: 'PUSH NOTIFICATIONS',
    PUSH_UNSUPPORTED: 'Your browser does not support push notifications.',
    PUSH_DENIED: '✗ Blocked — unblock in browser settings',
    PUSH_ACTIVE: '◉ Notifications active',
    PUSH_ENABLE: 'Enable notifications',
    PUSH_CONNECTING: '◌ Connecting…',
    PUSH_DESCRIPTION: 'Alert when a military aircraft enters your GPS range — even when the app is closed. Checked every 5 minutes by the server.',
    TEST_PUSH_LABEL: 'TEST PUSH',
    TEST_PUSH_BTN: '⚠ Send test push from server',
    TEST_PUSH_SENDING: '◌ Sending…',
    TEST_PUSH_OK: '◉ Sent. If you did not receive a notification — APNS/iOS issue.',
    SERVER_POSITION_LABEL: 'POSITION ON SERVER',
    SERVER_NO_GPS: '✗ No GPS — server cannot send alerts without your position.',
    SERVER_SYNC_ERROR: '✗ Server sync error:',
    SERVER_DIAG_LABEL: 'SERVER DIAGNOSTICS',
    DIAG_FETCHING: '◌ Fetching status…',
    DIAG_READY: 'Ready to send',
    DIAG_NO_GPS: 'No GPS on server',
    DIAG_STALE: 'Position >7 days (stale)',
    DIAG_NOT_REGISTERED: 'Subscription not saved!',
    DIAG_PROVIDER: 'Provider:',
    DIAG_GPS_AGE: 'GPS age:',
    DIAG_VAPID: 'VAPID configured:',
    DIAG_VAPID_SUBJECT: 'VAPID subject:',
    DIAG_STORE_ERRORS: 'Blob store errors:',
    DIAG_LAST_RUN: 'Last cron run:',
    DIAG_SUBSCRIPTIONS: 'Subscriptions:',
    DIAG_SENT: 'Sent:',
    DIAG_ERRORS: 'Errors:',
    DIAG_SKIPPED_NO_GPS: 'Skipped (no GPS):',
    DIAG_SKIPPED_STALE: 'Skipped (stale GPS):',
    ALTITUDE_LABEL: 'ALTITUDE SCALE',
    REFRESH_BTN: '↻ Refresh',
    SETTINGS_FOOTER: 'If alerts don\'t work: close and reopen the app (force refresh).',
    SELECT_MAP: 'SELECT MAP',
    LANGUAGE_LABEL: 'LANGUAGE',
    LANG_PL: 'Polski',
    LANG_EN: 'English',
    ALERT_TAG: '⚠ IN RANGE',
    ALERT_OVERFLOW: 'more in range',
    INFO_TYPE: 'Type',
    INFO_OPERATOR: 'Operator',
    INFO_DISTANCE: 'Distance',
    INFO_PROGRESS: 'Track',
    INFO_ALTITUDE: 'Altitude',
    INFO_PHASE: 'Phase',
    INFO_VS: 'V/S',
    INFO_SPEED: 'Speed',
    INFO_COUNTRY: 'Country',
    INFO_ON_RADAR: 'On radar',
    INFO_TRAIL: 'Trail:',
    INFO_TRAIL_PTS: 'pts',
    PHOTO_NOT_FOUND: '🛩 No photo on planespotters.net',
    PHOTO_ERROR: '⚠ Could not fetch photo (network / timeout)',
    EXT_LINK: 'Open in ADS-B Exchange ↗',
    APPROACH_LEAVING: 'Moving away',
    APPROACH_FAR: 'Approaching · over 60 min',
    APPROACH_OVERHEAD: 'directly overhead',
    PHASE_GROUND: 'On ground',
    PHASE_TAKEOFF: 'Climbing after takeoff',
    PHASE_APPROACH: 'Final approach',
    PHASE_CLIMB: 'Climbing',
    PHASE_DESCEND: 'Descending',
    PHASE_CRUISE: 'Cruise',
    CLOSE: 'Close',
    CLOSE_PANEL: 'Close panel',
    CLOSE_AIRCRAFT_PANEL: 'Close aircraft panel',
    DISMISS_NOTIFICATION: 'Dismiss notification',
    UPDATE_AVAILABLE: '◉ New version available',
    UPDATE_RELOAD: 'Reload',
    BOOT_ERROR_TITLE: '⚠ Application is not responding',
    BOOT_ERROR_HINT: 'Check your connection and reload the page.',
    NOTIF_TITLE: 'Military aircraft in range!',
    NOTIF_TITLE_NEAR: 'Military aircraft close to you!',
    NOTIF_UNKNOWN_TYPE: 'unknown type',
    NOTIF_SHOW: 'Show on map',
  },
}

function pickInitialLang() {
  try {
    const stored = localStorage.getItem('radar.lang')
    if (stored && STRINGS[stored]) return stored
  } catch {}
  const browser = (navigator.language || navigator.userLanguage || 'en').slice(0, 2).toLowerCase()
  return STRINGS[browser] ? browser : 'en'
}

let _lang = pickInitialLang()
const _listeners = new Set()

export function t(key) {
  return STRINGS[_lang]?.[key] ?? STRINGS.en[key] ?? STRINGS.pl[key] ?? key
}

export function getLang() { return _lang }

export function setLang(lang) {
  if (!STRINGS[lang] || lang === _lang) return
  _lang = lang
  try { localStorage.setItem('radar.lang', lang) } catch {}
  document.documentElement.lang = lang
  _listeners.forEach(fn => fn(lang))
}

export function availableLangs() { return Object.keys(STRINGS) }

// React hook so components re-render when language changes.
import { useEffect, useState } from 'react'
export function useLang() {
  const [lang, setStateLang] = useState(_lang)
  useEffect(() => {
    const fn = (l) => setStateLang(l)
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  }, [])
  return lang
}

// Set <html lang> on load so screen readers and search engines see correct lang.
if (typeof document !== 'undefined') document.documentElement.lang = _lang
