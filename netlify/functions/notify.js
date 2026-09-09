import { getStore, connectLambda } from '@netlify/blobs'
import webpush from 'web-push'
import { fetchMilitaryNear, haversine, normalizeKinds } from './lib/military.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:admin@example.com'

const MAX_POSITION_AGE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
const CLOSE_RANGE_KM = 10
// Don't re-alert the same aircraft within this window. JEDEN cooldown na hex,
// wspólny dla wszystkich kategorii — dystans i rodzaj maszyny decydują tylko o
// treści tego jednego powiadomienia. Wcześniej „blisko" i „w zasięgu" miały
// osobne mapy, więc samolot wlatujący w promień z dużej odległości dostawał
// najpierw alert „w zasięgu", a po kilku minutach drugi „blisko Ciebie".
// Znacznik jest odświeżany w każdym przebiegu, dopóki maszyna jest w promieniu,
// więc cooldown liczy się od WYLOTU — chwilowy zanik sygnału nie alarmuje ponownie.
const ALERT_COOLDOWN_MS = 45 * 60 * 1000
const NEAR_GROUP_THRESHOLD = 3    // above this many close planes, group them too
const FAR_LIST_MAX = 5            // max names listed in a grouped push
const MAX_COVERAGE_KM = 1500      // clamp for the shared fetch bounding circle

// Polish numeral agreement for "samolot"
function planeWord(n) {
  if (n === 1) return 'wojskowy samolot'
  const t = n % 10, h = n % 100
  if (t >= 2 && t <= 4 && !(h >= 12 && h <= 14)) return 'wojskowe samoloty'
  return 'wojskowych samolotów'
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
function compass(track) {
  if (track == null) return null
  return COMPASS[Math.round(track / 45) % 8]
}

function planeLabel(ac) {
  return `${ac.flight?.trim() || ac.hex}${ac.t ? ` (${ac.t})` : ''}`
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

// "F16 (F16) — 8 km, FL300, kurs N"
function planeDetail(ac) {
  const parts = [`${ac._dist} km`]
  if (ac.alt_baro != null) parts.push(`FL${Math.round(ac.alt_baro / 100)}`)
  const c = compass(ac.track)
  if (c) parts.push(`kurs ${c}`)
  return parts.join(', ')
}

// Body for a grouped push: lists up to FAR_LIST_MAX names + overflow count.
function groupBody(sorted) {
  const names = sorted.slice(0, FAR_LIST_MAX).map(a => a.flight?.trim() || a.hex)
  const extra = sorted.length - names.length
  return `${names.join(', ')}${extra > 0 ? ` +${extra}` : ''} — od ${sorted[0]._dist} km`
}

// Scheduled function, cron co minutę (netlify.toml). UWAGA na limit czasu:
// przy dużym wzroście liczby subskrypcji równoległe fetche + sekwencyjne pushy
// mogą przekroczyć limit wykonania (Netlify scheduled ~10 s). Ryzyko duplikatów
// jest już zdjęte — mapy cooldownu zapisujemy PRZED wysyłką (patrz
// processSubscription), więc ubity w połowie run najwyżej zgubi pojedynczy alert,
// nie zapętli powiadomień. Jeśli kiedyś liczba subskrypcji urośnie na tyle, że
// runy zaczną być ucinane: przenieść notify na background function (nazwa
// *-background, limit 15 min) albo rozbić przetwarzanie na paczki.
export const handler = async (event) => {
  try { if (event?.blobs) connectLambda(event) } catch {}
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
    alertedStore = getStore('push-alerted')
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
    return processSubscription(v, aircraft, subsStore, alertedStore, stats)
  }))

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      stats.notificationsSent += r.value.sent || 0
      stats.pushErrors += r.value.errors || 0
    }
  }

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
  const alertedStore = getStore('push-alerted')
  const { blobs } = await subsStore.list()
  const now = Date.now()
  let removed = 0
  await Promise.allSettled((blobs || []).map(async b => {
    const rec = await subsStore.get(b.key, { type: 'json' }).catch(() => null)
    if (!rec) return
    const age = now - (rec.updatedAt || rec.createdAt || now)
    if (age <= SUBSCRIPTION_MAX_AGE_MS) return
    await subsStore.delete(b.key).catch(() => {})
    await alertedStore.delete(b.key).catch(() => {})
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

async function processSubscription({ key, raw, ageMs }, aircraft, subsStore, alertedStore, stats) {
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
    // Wojsko zachowuje rozróżnienie blisko (≤10 km) / w zasięgu; nowe kategorie
    // (duże samoloty, śmigłowce służbowe) alertują po prostu w całym promieniu.
    const milNow = enriched.filter(a => (a.kind || 'mil') === 'mil')
    const heavyNow = enriched.filter(a => a.kind === 'heavy')
    const heliNow = enriched.filter(a => a.kind === 'heli')
    const nearNow = milNow.filter(a => a._dist <= CLOSE_RANGE_KM)
    const farNow = milNow.filter(a => a._dist > CLOSE_RANGE_KM)
    // Każda maszyna trafia dokładnie do jednego z tych czterech koszyków, a
    // wszystkie sięgają po ten sam cooldown — stąd jeden alert na samolot.
    const newNear = nearNow.filter(a => eligible(a.hex))
    const newFar = farNow.filter(a => eligible(a.hex))
    const newHeavy = heavyNow.filter(a => eligible(a.hex))
    const newHeli = heliNow.filter(a => eligible(a.hex))

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
    const nextAlerted = {}
    for (const a of enriched) nextAlerted[a.hex] = now
    for (const [hex, ts] of Object.entries(prevAlerted)) {
      if (!(hex in nextAlerted) && now - ts <= ALERT_COOLDOWN_MS) nextAlerted[hex] = ts
    }
    // Skip the write when the cooldown content is unchanged (the common
    // empty-sky case) — saves one blob write per idle subscription per minute.
    if (!cooldownMapEqual(nextAlerted, prevAlerted)) {
      await alertedStore.set(key, JSON.stringify({ alerted: nextAlerted, ts: now }))
    }

    subDiag.gpsAgeMs = ageMs
    subDiag.radius = radius
    subDiag.inRange = enriched.length
    if (aircraft.length !== enriched.length) subDiag.filteredOutByKind = aircraft.length - enriched.length
    subDiag.newAircraft = newFar.length
    subDiag.newNearAircraft = newNear.length

    const endpoint = subscription.endpoint || ''
    subDiag.pushProvider = endpoint.includes('apple.com') ? 'apple'
      : endpoint.includes('fcm.googleapis.com') ? 'fcm'
      : endpoint.includes('mozilla.com') ? 'mozilla'
      : 'other'

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
        if (status === 410 || status === 404) return { expired: true }
        subDiag.lastPushError = { status, msg: err.message }
        return {}
      }
    }
    const cleanupExpired = async () => {
      await subsStore.delete(key).catch(() => {})
      await alertedStore.delete(key).catch(() => {})
      stats.expiredRemoved++
      subDiag.status = 'expired-removed'
      stats.perSub.push(subDiag)
    }

    // Close-range alerts (≤10 km): the urgent ones. Sent individually with
    // full detail, but collapsed into one grouped push if the sky is busy.
    if (newNear.length) {
      const sorted = [...newNear].sort((a, b) => a._dist - b._dist)
      const n = sorted.length
      if (n <= NEAR_GROUP_THRESHOLD) {
        for (const ac of sorted) {
          const { expired } = await send({
            title: 'Wojskowy samolot blisko Ciebie!',
            body: `${planeLabel(ac)} — ${planeDetail(ac)}`,
            tag: ac.hex,
            hex: ac.hex,
          }, `near hex=${ac.hex} dist=${ac._dist}km`)
          if (expired) { await cleanupExpired(); return result }
        }
      } else {
        const { expired } = await send({
          title: `${n} ${planeWord(n)} blisko Ciebie!`,
          body: groupBody(sorted),
          tag: 'mil-near-group',
          hex: sorted[0].hex,
        }, `near group n=${n}`)
        if (expired) { await cleanupExpired(); return result }
      }
    }

    // Far-range alerts: collapsed into a single grouped push so a busy sky
    // doesn't fire a dozen separate notifications.
    if (newFar.length) {
      const sorted = [...newFar].sort((a, b) => a._dist - b._dist)
      const n = sorted.length
      let title, body, tag
      if (n === 1) {
        const ac = sorted[0]
        title = 'Wojskowy samolot w zasięgu!'
        body = `${planeLabel(ac)} — ${planeDetail(ac)}`
        tag = ac.hex
      } else {
        title = `${n} ${planeWord(n)} w zasięgu!`
        body = groupBody(sorted)
        tag = 'mil-far-group'
      }
      const { expired } = await send({ title, body, tag, hex: sorted[0].hex }, `far group n=${n}`)
      if (expired) { await cleanupExpired(); return result }
    }

    // Duże samoloty (B747 / An-124) — rzadkie, więc warty osobny alert.
    if (newHeavy.length) {
      const sorted = [...newHeavy].sort((a, b) => a._dist - b._dist)
      const n = sorted.length
      const { expired } = await send({
        title: n === 1 ? 'Duży samolot w zasięgu!' : `${n} dużych samolotów w zasięgu!`,
        body: n === 1 ? `${planeLabel(sorted[0])} — ${planeDetail(sorted[0])}` : groupBody(sorted),
        tag: n === 1 ? sorted[0].hex : 'heavy-group',
        hex: sorted[0].hex,
      }, `heavy group n=${n}`)
      if (expired) { await cleanupExpired(); return result }
    }

    // Śmigłowce służbowe (pogotowie / policja / Straż Graniczna).
    if (newHeli.length) {
      const sorted = [...newHeli].sort((a, b) => a._dist - b._dist)
      const n = sorted.length
      const { expired } = await send({
        title: n === 1 ? 'Śmigłowiec służbowy w zasięgu!' : `${n} śmigłowców służbowych w zasięgu!`,
        body: n === 1 ? `${planeLabel(sorted[0])} — ${planeDetail(sorted[0])}` : groupBody(sorted),
        tag: n === 1 ? sorted[0].hex : 'heli-group',
        hex: sorted[0].hex,
      }, `heli group n=${n}`)
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
