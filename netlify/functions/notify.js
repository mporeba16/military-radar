import { getStore } from '@netlify/blobs'
import webpush from 'web-push'
import { haversine, normalizeKinds } from './lib/military.js'
import { fetchMilitaryNear, fetchMilGlobal } from './lib/sources.js'
import { isInPoland } from './lib/poland.js'
import { isQuietHours } from './lib/quietHours.js'
import { pushProvider, isExpiredPush, removeSubscription, pruneCooldown } from './lib/push.js'
import { rareRole } from '../../src/lib/rareTypes.js'
import { AIRFIELDS } from '../../src/airfields.js'
// Treść alertów mieszka we wspólnym module — ten sam kod składa push z serwera
// i lokalne powiadomienie w otwartej aplikacji, więc nie mogą się rozjechać.
import { alertText, groupText, rareText, rareGroupText, inboundText, CLOSE_RANGE_KM } from '../../src/lib/notifyText.js'
import { airportByIcao, etaMinutes, formatEta, landingClock } from '../../src/lib/inbound.js'
import { SNAPSHOT_STORE, SNAPSHOT_KEY } from './inbound.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:admin@example.com'

const MAX_POSITION_AGE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
// Don't re-alert the same aircraft within this window. JEDEN cooldown na hex,
// wspólny dla wszystkich kategorii — dystans i rodzaj maszyny decydują tylko o
// treści tego jednego powiadomienia. Wcześniej „blisko" i „w zasięgu" miały
// osobne mapy, więc samolot wlatujący w promień z dużej odległości dostawał
// najpierw alert „w zasięgu", a po kilku minutach drugi „blisko Ciebie".
// Znacznik jest odświeżany w każdym przebiegu, dopóki maszyna jest w promieniu,
// więc cooldown liczy się od WYLOTU — chwilowy zanik sygnału nie alarmuje ponownie.
const ALERT_COOLDOWN_MS = 45 * 60 * 1000
const NEAR_GROUP_THRESHOLD = 3    // above this many close planes, group them too
const MAX_COVERAGE_KM = 1500      // clamp for the shared fetch bounding circle
// Rzadka maszyna (tankowiec, AWACS…) nad Polską alarmuje raz na pół doby —
// tankowiec potrafi krążyć nad krajem kilka godzin, a jeden alert wystarczy.
const RARE_COOLDOWN_MS = 12 * 60 * 60 * 1000
const RARE_GROUP_THRESHOLD = 2
const RARE_NEAR_AIRFIELD_KM = 80
// Wielkie transportowce: jeden alert na lot. Cooldown dłuższy niż najdłuższy
// przelot, żeby ta sama maszyna nie zaalarmowała drugi raz po drodze.
const INBOUND_COOLDOWN_MS = 18 * 60 * 60 * 1000
// Zbyt wcześnie nie ma sensu: przy dwunastu godzinach do lądowania szacunek
// jest bardzo zgrubny, a maszyna może jeszcze zawrócić.
const INBOUND_MAX_ETA_MIN = 10 * 60
const PL_AIRFIELDS = AIRFIELDS.filter(a => a.icao.startsWith('EP'))

// Rzadkie maszyny w powietrzu nad Polską z listy /mil. Czysta funkcja, żeby
// dało się ją przetestować bez sieci.
export function findRare(milList) {
  const out = []
  for (const a of milList || []) {
    if (a.lat == null || a.lon == null) continue
    if (a.alt_baro === 'ground' || a.on_ground) continue
    if (!isInPoland(a.lat, a.lon)) continue
    const role = rareRole(a.t)
    if (role) out.push({ ac: a, role })
  }
  return out
}

function nearestAirfieldName(lat, lon) {
  let best = null
  for (const ap of PL_AIRFIELDS) {
    const d = haversine(lat, lon, ap.lat, ap.lon)
    if (d <= RARE_NEAR_AIRFIELD_KM && (!best || d < best.d)) best = { d, name: ap.name }
  }
  return best?.name || null
}

/**
 * Co wysłać jednej subskrypcji z maszyn w jej zasięgu (`inRange`, z `_dist`),
 * które nie są w cooldownie (`eligible(hex)`). Kolejność: wojsko blisko
 * (≤ CLOSE_RANGE_KM; pojedynczo, przy gęstym niebie zbiorczo), wojsko
 * w zasięgu, duże samoloty, śmigłowce służbowe — każda grupa jednym
 * powiadomieniem, żeby gęste niebo nie odpaliło kilkunastu osobnych.
 * Każda maszyna trafia do dokładnie jednej grupy, a wszystkie sięgają po ten
 * sam cooldown — stąd jeden alert na samolot.
 */
export function planAlerts(inRange, eligible) {
  const byDist = list => [...list].sort((a, b) => a._dist - b._dist)
  const textOf = ({ title, body }) => ({ title, body })
  const fresh = inRange.filter(a => eligible(a.hex))
  const mil = fresh.filter(a => (a.kind || 'mil') === 'mil')
  const near = byDist(mil.filter(a => a._dist <= CLOSE_RANGE_KM))
  const out = []

  if (near.length <= NEAR_GROUP_THRESHOLD) {
    for (const ac of near) {
      out.push({ ...textOf(alertText(ac, ac._dist)), tag: ac.hex, hex: ac.hex, label: `near hex=${ac.hex} dist=${ac._dist}km` })
    }
  } else {
    out.push({ ...textOf(groupText(near, 'mil')), tag: 'mil-near-group', hex: near[0].hex, label: `near group n=${near.length}` })
  }

  const groups = [
    ['far', mil.filter(a => a._dist > CLOSE_RANGE_KM), 'mil', 'mil-far-group'],
    ['heavy', fresh.filter(a => a.kind === 'heavy'), 'heavy', 'heavy-group'],
    ['heli', fresh.filter(a => a.kind === 'heli'), 'heli', 'heli-group'],
  ]
  for (const [label, list, kind, groupTag] of groups) {
    if (!list.length) continue
    const sorted = byDist(list)
    const one = sorted.length === 1
    out.push({
      ...textOf(one ? alertText(sorted[0], sorted[0]._dist) : groupText(sorted, kind)),
      tag: one ? sorted[0].hex : groupTag,
      hex: sorted[0].hex,
      label: `${label} group n=${sorted.length}`,
    })
  }
  return { payloads: out, near: near.length, far: groups[0][1].length }
}

// Dedup po urządzeniu: jeśli jeden telefon ma kilka rekordów subskrypcji
// (rotacja endpointu APNS, albo stare rekordy bez deviceId, których prune w
// subscribe.js nie sprzątnął), bez tego dostałby KAŻDY alert tyle razy, ile ma
// rekordów — to główna przyczyna „podwójnych" powiadomień na iOS. Zostawiamy
// tylko najświeższy endpoint (max updatedAt) na deviceId; rekordy bez deviceId
// zostają nietknięte (nie mamy jak ich powiązać z urządzeniem).
export function dedupeByDevice(subs) {
  const byDevice = new Map()
  const out = []
  for (const v of subs) {
    const dev = v.raw?.deviceId
    if (!dev) { out.push(v); continue }
    const prev = byDevice.get(dev)
    if (!prev || (v.raw.updatedAt || 0) > (prev.raw.updatedAt || 0)) byDevice.set(dev, v)
  }
  for (const v of byDevice.values()) out.push(v)
  return out
}

// Wczytuje zapisany rekord cooldownu do jednej mapy hex→timestamp. Obsługuje
// wszystkie historyczne formaty: bieżący `alerted`, wcześniejsze rozdzielone
// `far`/`near` oraz najstarszą tablicę `hexes`. Dla hexa obecnego w kilku
// polach bierzemy NAJŚWIEŻSZY znacznik, żeby migracja nie skróciła cooldownu.
export function toCooldownMap(rec, now) {
  const out = {}
  if (!rec) return out
  const merge = (v) => {
    if (!v) return
    if (Array.isArray(v)) {
      for (const h of v) out[h] = Math.max(out[h] || 0, now)
      return
    }
    for (const [h, ts] of Object.entries(v)) out[h] = Math.max(out[h] || 0, ts)
  }
  merge(rec.alerted)
  merge(rec.far)
  merge(rec.near)
  merge(rec.hexes)
  return out
}

// Shallow equality of two hex→timestamp cooldown maps (order-independent).
export function cooldownMapEqual(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (a[k] !== b[k]) return false
  return true
}

// Scheduled function, cron co minutę (netlify.toml). UWAGA na limit czasu:
// przy dużym wzroście liczby subskrypcji równoległe fetche + sekwencyjne pushy
// mogą przekroczyć limit wykonania (Netlify scheduled ~10 s). Ryzyko duplikatów
// jest już zdjęte — mapy cooldownu zapisujemy PRZED wysyłką (patrz
// processSubscription), więc ubity w połowie run najwyżej zgubi pojedynczy alert,
// nie zapętli powiadomień. Jeśli kiedyś liczba subskrypcji urośnie na tyle, że
// runy zaczną być ucinane: przenieść notify na background function (nazwa
// *-background, limit 15 min) albo rozbić przetwarzanie na paczki.
// Mapy cooldownu czytamy z pominięciem pamięci podręcznej Blobs. Domyślna
// spójność „eventual" rozchodzi zapis do 60 s, a cron chodzi co 60 s — kolejny
// przebieg potrafił przeczytać mapę sprzed zapisu i wysłać to samo
// powiadomienie drugi raz minutę później. `strong` działa tylko w funkcjach
// w nowym formacie (export default), stąd ten format zamiast `handler`.
const cooldownStore = name => getStore({ name, consistency: 'strong' })

export default async () => {
  const { statusCode, body } = await run()
  return new Response(body, { status: statusCode })
}

async function run() {
  // Cisza nocna (1:00–6:00) — bez push i bez odpytywania źródeł. Maszyna,
  // która nadal jest w zasięgu o 6:00, dostanie alert w pierwszym przebiegu.
  if (isQuietHours()) return { statusCode: 200, body: 'quiet hours' }
  const runStart = Date.now()
  const stats = {
    startedAt: new Date(runStart).toISOString(),
    vapidConfigured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
    vapidSubject: VAPID_EMAIL,
    totalSubs: 0,
    skippedNoGps: 0,
    skippedStaleGps: 0,
    skippedInvalid: 0,
    processed: 0,
    notificationsSent: 0,
    pushErrors: 0,
    expiredRemoved: 0,
    perSub: [],
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('[notify] VAPID keys not configured, skipping run')
    stats.error = 'VAPID not configured'
    await writeRunStats(stats, runStart)
    return { statusCode: 200, body: JSON.stringify(stats) }
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  let subsStore, alertedStore, blobs
  try {
    subsStore = getStore('push-subscriptions')
    alertedStore = cooldownStore('push-alerted')
    const result = await subsStore.list()
    blobs = result.blobs
  } catch (err) {
    console.error('[notify] Failed to access Blobs:', err.message)
    stats.error = `Blobs error: ${err.message}`
    return { statusCode: 500, body: JSON.stringify(stats) }
  }

  stats.totalSubs = blobs?.length || 0
  if (!blobs?.length) {
    console.log('[notify] No subscriptions in store')
    await writeRunStats(stats, runStart)
    return { statusCode: 200, body: JSON.stringify(stats) }
  }

  // Pass 1 — load every subscription and classify. We need locations up front
  // so we can fetch the military snapshot ONCE for all of them instead of
  // hitting the API per subscription (the /mil query is identical for everyone).
  const loaded = await Promise.all(blobs.map(async ({ key }) => ({
    key,
    raw: await subsStore.get(key, { type: 'json' }).catch(() => null),
  })))

  const valid = []
  for (const { key, raw } of loaded) {
    if (!raw?.subscription) {
      stats.skippedInvalid++
      stats.perSub.push({ key, status: 'invalid-no-subscription' })
      continue
    }
    if (raw.lat == null || raw.lon == null) {
      stats.skippedNoGps++
      stats.perSub.push({ key, status: 'skipped-no-gps', createdAt: raw.createdAt })
      continue
    }
    const ageMs = Date.now() - (raw.updatedAt || 0)
    if (ageMs > MAX_POSITION_AGE_MS) {
      stats.skippedStaleGps++
      stats.perSub.push({ key, status: 'skipped-stale-gps', gpsAgeMs: ageMs })
      continue
    }
    valid.push({ key, raw, ageMs })
  }

  const deduped = dedupeByDevice(valid)
  stats.dedupedDuplicates = valid.length - deduped.length
  if (stats.dedupedDuplicates > 0) {
    console.log(`[notify] deduped ${stats.dedupedDuplicates} duplicate device record(s)`)
  }

  // Shared fetch: one bounding circle (centroid + reach) covering all subs.
  // adsb.fi /mil is global so tagged military is always covered; the geographic
  // supplement is capped at ~250nm from the centroid, so subs far from the
  // centroid may miss callsign-only matches — fine for a Poland-focused app.
  let snapshot = []
  let cLat = 0, cLon = 0, coverage = 0
  if (deduped.length) {
    cLat = deduped.reduce((s, v) => s + v.raw.lat, 0) / deduped.length
    cLon = deduped.reduce((s, v) => s + v.raw.lon, 0) / deduped.length
    for (const v of deduped) {
      coverage = Math.max(coverage, haversine(cLat, cLon, v.raw.lat, v.raw.lon) + (v.raw.radius ?? 100))
    }
    coverage = Math.min(Math.ceil(coverage), MAX_COVERAGE_KM)
    snapshot = await fetchMilitaryNear(cLat, cLon, coverage)
    stats.snapshotCount = snapshot.length
    stats.coverageKm = coverage
  }

  // A sub is fully covered by the shared snapshot only if its whole bubble fits
  // inside the fetched circle. If the coverage clamp kicked in (subs spread very
  // far apart), the outliers fall outside it — fetch those individually so they
  // don't silently miss alerts. The common case (everyone clustered) hits zero
  // extra fetches.
  const covered = (v) =>
    haversine(cLat, cLon, v.raw.lat, v.raw.lon) + (v.raw.radius ?? 100) <= coverage + 0.5

  // Pass 2 — resolve each sub's aircraft (shared snapshot, or own fetch) and process.
  const results = await Promise.allSettled(deduped.map(async (v) => {
    const radius = v.raw.radius ?? 100
    const aircraft = covered(v)
      ? snapshot.filter(a => haversine(v.raw.lat, v.raw.lon, a.lat, a.lon) <= radius)
      : await fetchMilitaryNear(v.raw.lat, v.raw.lon, radius)
    return processSubscription(v, aircraft, alertedStore, stats)
  }))

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      stats.notificationsSent += r.value.sent || 0
      stats.pushErrors += r.value.errors || 0
    }
  }

  // Pass 4 — jumbo jety i An-124 z celem w Rzeszowie/Krakowie. Czyta migawkę
  // z crona `inbound-collect`, więc nie odpytuje niczego na zewnątrz.
  await processInbound(loaded, stats).catch(err => {
    console.error('[notify] inbound pass failed:', err.message)
    stats.inboundError = err.message
  })

  // Pass 3 — rzadkie maszyny nad całą Polską. Nie zależą od pozycji
  // użytkownika, więc idą też do subskrypcji bez GPS.
  await processRare(loaded, stats).catch(err => {
    console.error('[notify] rare pass failed:', err.message)
    stats.rareError = err.message
  })


  stats.durationMs = Date.now() - runStart
  console.log(`[notify] Run complete: ${JSON.stringify({
    totalSubs: stats.totalSubs,
    processed: stats.processed,
    snapshotCount: stats.snapshotCount,
    skippedNoGps: stats.skippedNoGps,
    skippedStaleGps: stats.skippedStaleGps,
    skippedInvalid: stats.skippedInvalid,
    notificationsSent: stats.notificationsSent,
    pushErrors: stats.pushErrors,
    expiredRemoved: stats.expiredRemoved,
    durationMs: stats.durationMs,
  })}`)

  await writeRunStats(stats, runStart)
  return { statusCode: 200, body: JSON.stringify(stats) }
}

// Rozsyłka tego samego zdarzenia (przylot, rzadka maszyna) do wielu urządzeń.
// `payloadsFor(v)` mówi, co dostaje dane urządzenie (np. wg jego przełączników).
async function broadcast(recipients, payloadsFor, stats, counter, label) {
  stats[counter] = 0
  await Promise.allSettled(recipients.map(async v => {
    for (const p of payloadsFor(v)) {
      try {
        await webpush.sendNotification(v.raw.subscription, JSON.stringify(p))
        stats[counter]++
        stats.notificationsSent++
      } catch (err) {
        stats.pushErrors++
        if (isExpiredPush(err)) {
          await removeSubscription(v.key)
          stats.expiredRemoved++
          return
        }
        console.error(`[notify] ${label} push FAIL ${v.key} status=${err.statusCode || 0} msg=${err.message}`)
      }
    }
  }))
}

const allRecipients = loaded => dedupeByDevice(loaded.filter(v => v.raw?.subscription))

async function processInbound(loaded, stats) {
  const snap = await getStore(SNAPSHOT_STORE).get(SNAPSHOT_KEY, { type: 'json' }).catch(() => null)
  const list = snap?.inbound || []
  if (!list.length) return

  const now = Date.now()
  const store = cooldownStore('push-inbound')
  const prev = (await store.get('alerted', { type: 'json' }).catch(() => null))?.alerted || {}

  const fresh = []
  const next = pruneCooldown(prev, INBOUND_COOLDOWN_MS, now)
  for (const x of list) {
    const airport = airportByIcao(x.route?.to)
    if (!airport) continue
    const min = etaMinutes(x, airport)
    if (min == null || min > INBOUND_MAX_ETA_MIN) continue
    const key = `${x.hex}|${x.route.to}`
    if (!prev[key] || now - prev[key] > INBOUND_COOLDOWN_MS) fresh.push({ x, airport, min })
    next[key] = now
  }
  await store.set('alerted', JSON.stringify({ alerted: next, ts: now }))
  if (!fresh.length) return

  const recipients = allRecipients(loaded)
  await broadcast(recipients, v => fresh
    // Przełącznik lotniska z ustawień urządzenia; brak pola = włączone.
    .filter(({ airport }) => v.raw.arrivals?.[airport.icao] !== false)
    .map(({ x, airport, min }) => ({
      ...inboundText(x, airport.name, landingClock(min, now), formatEta(min)),
      tag: `inbound-${x.hex}`, hex: x.hex,
    })), stats, 'inboundSent', 'inbound')
  console.log(`[notify] inbound: ${fresh.map(f => `${f.x.flight}→${f.airport.icao}`).join(', ')} → ${recipients.length} subs`)
}

async function processRare(loaded, stats) {
  const rare = findRare(await fetchMilGlobal())
  stats.rareOverPoland = rare.length
  if (!rare.length) return

  const store = cooldownStore('push-rare')
  const now = Date.now()
  const prev = (await store.get('alerted', { type: 'json' }).catch(() => null))?.alerted || {}
  const fresh = rare.filter(({ ac }) => !prev[ac.hex] || now - prev[ac.hex] > RARE_COOLDOWN_MS)

  // Znacznik odświeżany, dopóki maszyna jest nad Polską — cooldown liczy się
  // od chwili, gdy ją opuści, jak przy alertach zasięgowych.
  const next = pruneCooldown(prev, RARE_COOLDOWN_MS, now)
  for (const { ac } of rare) next[ac.hex] = now
  // Zapis PRZED wysyłką — ubity run zgubi najwyżej jeden alert, nie powtórzy go.
  await store.set('alerted', JSON.stringify({ alerted: next, ts: now }))
  if (!fresh.length) return

  const payload = fresh.length <= RARE_GROUP_THRESHOLD
    ? fresh.map(({ ac, role }) => ({
        ...rareText(ac, role, nearestAirfieldName(ac.lat, ac.lon)),
        tag: `rare-${ac.hex}`, hex: ac.hex,
      }))
    : [{ ...rareGroupText(fresh), tag: 'rare-group', hex: fresh[0].ac.hex }]

  const recipients = allRecipients(loaded).filter(v => normalizeKinds(v.raw.kinds).rare)
  await broadcast(recipients, () => payload, stats, 'rareSent', 'rare')
  console.log(`[notify] rare: ${fresh.map(r => `${r.ac.hex}/${r.ac.t}`).join(', ')} → ${recipients.length} subs`)
}

async function writeRunStats(stats, runStart) {
  try {
    const runsStore = getStore('push-runs')
    // Housekeeping gated to ~once/hour so we don't list() stores every minute:
    // purge the legacy `run-<ts>` blobs older versions accumulated, expire stale
    // rate-limit records (their `ts` is >24h old → the window is long gone),
    // wyrzuć dawno porzucone subskrypcje i posprzątaj po nich mapy cooldownu.
    // Idzie PRZED zapisem `latest`, żeby liczniki sprzątania trafiły do podsumowania.
    if (runStart % 3_600_000 < 60_000) {
      await purgeLegacyRunBlobs(runsStore).catch(() => {})
      await purgeStaleRateLimits().catch(() => {})
      await purgeStaleSubscriptions(stats).catch(() => {})
      await purgeOrphanAlerted(stats).catch(() => {})
    }
    // Keep only the latest run summary — status.js reads this. We deliberately
    // do NOT write a per-run `run-<ts>` blob: the cron fires every minute, so
    // that grew ~1440 blobs/day unbounded with nothing ever reading them back.
    await runsStore.set('latest', JSON.stringify(stats))
  } catch (err) {
    console.error('[notify] Failed to write run stats:', err.message)
  }
}

async function purgeLegacyRunBlobs(runsStore) {
  const { blobs } = await runsStore.list()
  await Promise.allSettled((blobs || [])
    .filter(b => b.key.startsWith('run-'))
    .map(b => runsStore.delete(b.key)))
}

// Rekord, którego klient nie odświeżył od miesiąca, jest martwy: notify pomija
// go już po MAX_POSITION_AGE_MS, więc przez kolejne tygodnie tylko puchnie
// magazyn i lista w każdym przebiegu. Kasowanie jest odwracalne — przy następnym
// otwarciu aplikacji hook usePushNotifications zapisuje subskrypcję od nowa.
const SUBSCRIPTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
async function purgeStaleSubscriptions(stats) {
  const subsStore = getStore('push-subscriptions')
  const { blobs } = await subsStore.list()
  const now = Date.now()
  let removed = 0
  await Promise.allSettled((blobs || []).map(async b => {
    const rec = await subsStore.get(b.key, { type: 'json' }).catch(() => null)
    if (!rec) return
    const age = now - (rec.updatedAt || rec.createdAt || now)
    if (age <= SUBSCRIPTION_MAX_AGE_MS) return
    await removeSubscription(b.key)
    removed++
    console.log(`[notify] purged abandoned subscription key=${b.key} ageDays=${Math.round(age / 86_400_000)}`)
  }))
  if (removed) stats.staleSubsRemoved = removed
}

// Mapy cooldownu bez odpowiadającej subskrypcji. Zostawały po ścieżkach, które
// kasowały tylko push-subscriptions; te są już załatane, ale sprzątanie zostaje
// jako siatka bezpieczeństwa. Listujemy push-alerted PRZED push-subscriptions,
// żeby subskrypcja założona w trakcie nie wyglądała na osieroconą.
async function purgeOrphanAlerted(stats) {
  const alertedStore = getStore('push-alerted')
  const subsStore = getStore('push-subscriptions')
  const { blobs: alerted } = await alertedStore.list()
  const { blobs: subs } = await subsStore.list()
  const live = new Set((subs || []).map(b => b.key))
  const orphans = (alerted || []).filter(b => !live.has(b.key))
  await Promise.allSettled(orphans.map(async b => {
    await alertedStore.delete(b.key).catch(() => {})
    console.log(`[notify] purged orphan cooldown map key=${b.key}`)
  }))
  if (orphans.length) stats.orphanAlertedRemoved = orphans.length
}

const RATE_LIMIT_MAX_AGE_MS = 24 * 60 * 60 * 1000
async function purgeStaleRateLimits() {
  const store = getStore('rate-limit')
  const { blobs } = await store.list()
  const now = Date.now()
  await Promise.allSettled((blobs || []).map(async b => {
    const rec = await store.get(b.key, { type: 'json' }).catch(() => null)
    if (rec?.ts && now - rec.ts > RATE_LIMIT_MAX_AGE_MS) await store.delete(b.key).catch(() => {})
  }))
}


async function processSubscription({ key, raw, ageMs }, aircraft, alertedStore, stats) {
  const result = { sent: 0, errors: 0 }
  const subDiag = { key, status: 'processed' }

  try {
    const { subscription, lat, lon, radius = 100 } = raw
    stats.processed++
    const now = Date.now()

    const alertedRaw = await alertedStore.get(key, { type: 'json' }).catch(() => null)
    // Jedna mapa cooldownu na subskrypcję. Stare formaty (rozdzielone far/near,
    // najstarsza tablica `hexes`) są scalane w locie — znane hexy trafiają do
    // niej jako świeżo zaalarmowane, więc deploy nie wywołuje lawiny alertów.
    const prevAlerted = toCooldownMap(alertedRaw, now)
    const eligible = (hex) => !prevAlerted[hex] || (now - prevAlerted[hex]) > ALERT_COOLDOWN_MS

    // Filtr kategorii ustawiony w aplikacji obowiązuje też push. Odsiewamy tuż
    // po wzbogaceniu o dystans, więc maszyna z wyłączonej kategorii nie trafia
    // ani do koszyków, ani do mapy cooldownu — po ponownym włączeniu kategorii
    // zaalarmuje normalnie, jakby dopiero co się pojawiła.
    const wanted = normalizeKinds(raw.kinds)
    const enriched = aircraft
      .map(a => ({ ...a, _dist: Math.round(haversine(lat, lon, a.lat, a.lon)) }))
      .filter(a => wanted[a.kind || 'mil'])
    // Persist the cooldown map BEFORE sending. A scheduled function can be
    // killed mid-run (time limit) once some pushes have already gone out; if
    // we saved the cooldown only afterwards, the next run (a minute later)
    // would re-send the same alerts. Writing first means the worst case is a
    // single dropped alert rather than a duplicate storm — and this app has a
    // long history of fighting iOS duplicates, so that trade-off is deliberate.
    //
    // Every in-range plane is stamped `now`, niezależnie od kategorii i dystansu,
    // więc zbliżenie się poniżej CLOSE_RANGE_KM ani przeklasyfikowanie maszyny
    // (mil ↔ heli/heavy między feedami adsb.fi) nie odpali drugiego alertu.
    // Wpisy maszyn, które właśnie wyleciały, zostają do wygaśnięcia cooldownu.
    const nextAlerted = pruneCooldown(prevAlerted, ALERT_COOLDOWN_MS, now)
    for (const a of enriched) nextAlerted[a.hex] = now
    // Skip the write when the cooldown content is unchanged (the common
    // empty-sky case) — saves one blob write per idle subscription per minute.
    if (!cooldownMapEqual(nextAlerted, prevAlerted)) {
      await alertedStore.set(key, JSON.stringify({ alerted: nextAlerted, ts: now }))
    }

    subDiag.gpsAgeMs = ageMs
    subDiag.radius = radius
    subDiag.inRange = enriched.length
    if (aircraft.length !== enriched.length) subDiag.filteredOutByKind = aircraft.length - enriched.length
    const plan = planAlerts(enriched, eligible)
    subDiag.newAircraft = plan.far
    subDiag.newNearAircraft = plan.near
    subDiag.pushProvider = pushProvider(subscription.endpoint)

    const send = async (payload, logLabel) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload))
        result.sent++
        console.log(`[notify] Push OK ${subDiag.pushProvider} ${key} ${logLabel}`)
        return {}
      } catch (err) {
        result.errors++
        const status = err.statusCode || 0
        console.error(`[notify] Push FAIL ${subDiag.pushProvider} ${key} ${logLabel} status=${status} msg=${err.message}`)
        if (isExpiredPush(err)) return { expired: true }
        subDiag.lastPushError = { status, msg: err.message }
        return {}
      }
    }
    const cleanupExpired = async () => {
      await removeSubscription(key)
      stats.expiredRemoved++
      subDiag.status = 'expired-removed'
      stats.perSub.push(subDiag)
    }

    for (const { label, ...payload } of plan.payloads) {
      const { expired } = await send(payload, label)
      if (expired) { await cleanupExpired(); return result }
    }

    subDiag.sent = result.sent
    subDiag.errors = result.errors
    stats.perSub.push(subDiag)
    return result
  } catch (err) {
    console.error(`[notify] Error processing ${key}:`, err.message)
    subDiag.status = 'exception'
    subDiag.error = err.message
    stats.perSub.push(subDiag)
    return result
  }
}
