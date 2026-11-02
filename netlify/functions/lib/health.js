// Alarmy o awariach — push do urządzeń, które włączyły je w diagnostyce.
//
// Błąd Workera na Cloudflare („Too many subrequests") wyszedł dopiero przy
// ręcznym sprawdzaniu, a 59 tys. blobów, przez które tick co godzinę padał,
// leżało tam miesiącami. Tick wie o każdej z tych rzeczy w chwili, gdy się
// dzieje — tu zamieniamy to w powiadomienie.
//
// Problem musi trwać kilka przebiegów z rzędu (pojedynczy 429 to nie awaria),
// alarm idzie raz, z przypomnieniem co REMIND_MS, a po ustąpieniu — jedno
// „działa znowu". W ciszy nocnej nic nie wysyłamy: alarm pójdzie o 6:00.
// Gdy nie działa sam tick (Netlify przestał go uruchamiać), nie ma kto
// alarmować — to jedyna dziura w tym mechanizmie.

import { getStore } from '@netlify/blobs'
import webpush from 'web-push'
import { vapidConfig, isExpiredPush, removeSubscription } from './push.js'
import { isQuietHours } from './quietHours.js'
import { HEAVY_KEY, HEAVY_STORE } from './heavyEurope.js'

export const HEALTH_STORE = 'health'
export const HEALTH_KEY = 'state'

const REMIND_MS = 6 * 60 * 60 * 1000
// Migawka z Cloudflare powstaje co 5 minut — trzy przebiegi bez niej to awaria.
const WORKER_STALE_MS = 20 * 60 * 1000

// id → [ile przebiegów z rzędu, zanim alarmujemy, nazwa w treści]
const CHECKS = {
  tick: [3, 'zadania ticka'],
  sources: [5, 'źródła danych (adsb.fi / adsb.lol)'],
  worker: [1, 'cron na Cloudflare'],
}

/**
 * Które problemy występują w tym przebiegu: id → opis. Czysta funkcja.
 * `parts` — wyniki zadań ticka (napisy), `milOk`/`geoOk` — czy pobrały się
 * listy wojskowych i ruch nad Polską, `workerAt` — czas ostatniej migawki
 * z Cloudflare (null, gdy jej nie ma).
 */
export function detectProblems({ parts, milOk, geoOk, workerAt }, now = Date.now()) {
  const out = {}
  const failed = parts.filter(p => /ERROR/.test(p))
  if (failed.length) out.tick = failed.join(' | ').slice(0, 160)
  if (!milOk || !geoOk) out.sources = [!milOk && 'listy /mil', !geoOk && 'ruch nad Polską'].filter(Boolean).join(', ')
  if (workerAt == null || now - workerAt > WORKER_STALE_MS) {
    out.worker = workerAt == null ? 'brak migawki' : `ostatnia ${Math.round((now - workerAt) / 60000)} min temu`
  }
  return out
}

/**
 * Nowy stan i lista powiadomień do wysłania. Czysta funkcja.
 * Stan: id → { streak, since, alertedAt|null, detail }.
 */
export function nextHealth(prev = {}, problems, now = Date.now(), quiet = false) {
  const state = {}
  const messages = []
  for (const [id, [needed, label]] of Object.entries(CHECKS)) {
    const was = prev[id]
    if (problems[id]) {
      const cur = {
        streak: (was?.streak || 0) + 1,
        since: was?.since ?? now,
        alertedAt: was?.alertedAt ?? null,
        detail: problems[id],
      }
      const due = cur.streak >= needed && (!cur.alertedAt || now - cur.alertedAt >= REMIND_MS)
      if (due && !quiet) {
        const min = Math.max(1, Math.round((now - cur.since) / 60000))
        messages.push({ id, title: `Radar: awaria — ${label}`, body: `Od ${min} min: ${cur.detail}` })
        cur.alertedAt = now
      }
      state[id] = cur
    } else if (was?.alertedAt) {
      // Ustąpiło po alarmie — dajemy znać. W ciszy nocnej czekamy z tym
      // (stan zostaje), żeby nie budzić dobrą wiadomością.
      if (quiet) { state[id] = was; continue }
      messages.push({ id, title: `Radar: działa znowu — ${label}`, body: 'Problem ustąpił.' })
    }
  }
  return { state, messages }
}

const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Część ticka. Nigdy nie rzuca — alarmy nie mogą psuć przebiegu, który opisują.
export async function checkHealth({ parts, milOk, geoOk }, now = Date.now()) {
  try {
    const store = getStore({ name: HEALTH_STORE, consistency: 'strong' })
    const [prev, heavy] = await Promise.all([
      store.get(HEALTH_KEY, { type: 'json' }).catch(() => null),
      getStore(HEAVY_STORE).get(HEAVY_KEY, { type: 'json' }).catch(() => null),
    ])
    const problems = detectProblems({ parts, milOk, geoOk, workerAt: heavy?.at ?? null }, now)
    const { state, messages } = nextHealth(prev?.problems || {}, problems, now, isQuietHours(new Date(now)))
    // Zapis przed wysyłką (jak cooldowny powiadomień) i tylko przy zmianie —
    // przy zdrowym systemie to zero zapisów.
    if (!sameState(state, prev?.problems || {})) {
      await store.set(HEALTH_KEY, JSON.stringify({ at: now, problems: state }))
    }
    const sent = messages.length ? await sendHealth(messages) : 0
    const ids = Object.keys(problems)
    return `health ${ids.length ? ids.join(',') : 'OK'}${sent ? ` wysłano=${sent}` : ''}`
  } catch (err) {
    return `health ERROR ${err.message}`
  }
}

async function sendHealth(messages) {
  const vapid = vapidConfig()
  if (!vapid.configured) return 0
  webpush.setVapidDetails(vapid.subjectOrDefault, vapid.publicKey, vapid.privateKey)
  const subs = getStore('push-subscriptions')
  const { blobs } = await subs.list()
  const records = await Promise.all((blobs || []).map(async b => ({ key: b.key, raw: await subs.get(b.key, { type: 'json' }).catch(() => null) })))
  let sent = 0
  await Promise.allSettled(records.filter(r => r.raw?.subscription && r.raw.health === true).map(async ({ key, raw }) => {
    for (const m of messages) {
      const payload = { title: m.title, body: m.body, tag: `health-${m.id}`, hex: '__health__' }
      try {
        await webpush.sendNotification(raw.subscription, JSON.stringify(payload), { timeout: 5000 })
        sent++
      } catch (err) {
        if (isExpiredPush(err)) { await removeSubscription(key); return }
        console.error(`[health] push FAIL ${key} status=${err.statusCode || 0}`)
      }
    }
  }))
  return sent
}
