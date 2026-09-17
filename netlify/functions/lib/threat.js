import { getCommonName } from '../../../src/lib/typeNames.js'
import { isInPoland } from './poland.js'

// Model ryzyka „dron / rakieta nad wschodnią Polską”.
//
// WAŻNE, i powtórzone w UI: to NIE jest system ostrzegania. alerts.in.ua działa,
// bo dostaje oficjalny feed od ukraińskich władz — w Polsce takiego feedu nie ma
// (RCB nie publikuje ani API, ani RSS). To, co liczymy tutaj, jest POCHODNĄ
// dwóch darmowych, bezkluczowych sygnałów:
//
//   1. alarmy przeciwlotnicze w przygranicznych obwodach Ukrainy
//      (ubilling.net.ua/aerialalerts — bez klucza, cache ~1 min),
//   2. ruch wojskowy nad Polską, który aplikacja i tak już zbiera z adsb.fi
//      (obecność ISR/AWACS i tankowców to najczytelniejszy sygnał, jaki mamy
//      z danych ADS-B — widać go, zanim pojawi się jakikolwiek komunikat).
//
// Cały ten plik to czyste funkcje — żadnego fetcha, żadnych Blobs. Dzięki temu
// próg i wagi da się przetestować bez sieci (test/threat.test.js).

// ── Obwody Ukrainy, które mają znaczenie dla Polski ───────────────────────
// Klucze po nazwie zwracanej przez ubilling (cyrylica, dokładnie jak w JSON-ie).
export const UA_OBLASTS = {
  'Волинська область': { key: 'volyn', pl: 'wołyński' },
  'Львівська область': { key: 'lviv', pl: 'lwowski' },
  'Закарпатська область': { key: 'zakarpattia', pl: 'zakarpacki' },
  'Рівненська область': { key: 'rivne', pl: 'rówieński' },
  'Тернопільська область': { key: 'ternopil', pl: 'tarnopolski' },
}

// ── Województwa, dla których model cokolwiek wie ──────────────────────────
// `front`  — obwód leży przy samej granicy z tym województwem,
// `second` — druga linia: alarm tam znaczy, że coś leci w tę stronę, ale jest
//            jeszcze co najmniej jeden obwód do przelecenia.
// podlaskie i warmińsko-mazurskie nie mają żadnego obwodu: od tej strony
// (Białoruś, obwód kaliningradzki) nie istnieje darmowy feed alarmowy, więc
// podnieść je może wyłącznie sygnał z ADS-B.
export const REGIONS = [
  { id: 'lubelskie', name: 'lubelskie', front: ['volyn', 'lviv'], second: ['rivne'] },
  { id: 'podkarpackie', name: 'podkarpackie', front: ['lviv', 'zakarpattia'], second: ['ternopil'] },
  { id: 'mazowieckie', name: 'mazowieckie', front: [], second: ['volyn', 'lviv'] },
  { id: 'malopolskie', name: 'małopolskie', front: [], second: ['zakarpattia'] },
  { id: 'podlaskie', name: 'podlaskie', front: [], second: [] },
  { id: 'warminsko-mazurskie', name: 'warmińsko-mazurskie', front: [], second: [] },
]

const FRONT_POINTS = 40
const SECOND_POINTS = 18
const UA_PART_CAP = 60

// ── Progi poziomów ────────────────────────────────────────────────────────
export const LEVELS = ['calm', 'watch', 'elevated', 'high']

export function levelFor(score) {
  if (score >= 65) return 'high'
  if (score >= 40) return 'elevated'
  if (score >= 15) return 'watch'
  return 'calm'
}

// ── 1. Alarmy w Ukrainie ──────────────────────────────────────────────────
// Kształt odpowiedzi ubilling:
//   { source, cachedat, states: { "<nazwa obwodu>": { alertnow, changed } } }
export function parseUbilling(json) {
  const states = json?.states
  if (!states || typeof states !== 'object') return { ok: false, alerts: [] }
  const alerts = []
  for (const [name, meta] of Object.entries(states)) {
    const oblast = UA_OBLASTS[name]
    if (!oblast || !meta?.alertnow) continue
    alerts.push({ key: oblast.key, pl: oblast.pl, since: meta.changed || null })
  }
  alerts.sort((a, b) => a.key.localeCompare(b.key))
  return { ok: true, alerts, cachedAt: json.cachedat || null }
}

// ── 2. Sygnał z ADS-B ─────────────────────────────────────────────────────
// Liczymy maszyny w GRANICACH Polski, wielokątem współdzielonym z aircraft.js.
// Wcześniej był tu prostokąt 48,8–55,2°N / 14–24,8°E „bo pogranicze też jest
// istotne" — w praktyce wliczał trzy samoloty nad Czechami i plakietka mówiła
// „5 maszyn nad Polską", gdy na mapie widać było dwie. Liczba pokazywana
// użytkownikowi ma się zgadzać z tym, co widzi; sprawdzalność jest tu warta
// więcej niż czulszy, ale nieszczery wskaźnik.

// Typy ICAO, które w praktyce znaczą „NATO patrzy”. Sprawdzamy je wyłącznie na
// maszynach już zaklasyfikowanych jako wojskowe (kind === 'mil'), więc cywilne
// odpowiedniki tych samych kodów (A332, SF34) nie robią fałszywych trafień.
const ISR_TYPES = new Set([
  'E3TF', 'E3CF', 'E3', 'E6', 'E8',      // AWACS / TACAMO / JSTARS
  'R135', 'RC13',                         // RC-135 Rivet Joint / Cobra Ball
  'P8', 'P8A',                            // P-8 Poseidon
  'RQ4', 'Q4', 'MQ4', 'MQ9',              // Global Hawk / Triton / Reaper
  'SF34',                                 // ASC 890 (szwedzki AEW&C)
])

const TANKER_TYPES = new Set([
  'K35R', 'K35E', 'KC35', 'C135',         // KC-135
  'A332', 'MRTT',                         // A330 MRTT
  'K46', 'KC46',                          // KC-46
  'KC10', 'DC10',                         // KC-10
])

function normType(t) {
  return (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Powód alertu czyta człowiek, więc surowy adres ICAO („ae0265") jest tu bez
// wartości. Kolejność: znak wywoławczy, nazwa własna typu, kod typu, a hex
// dopiero na końcu, gdy nie wiadomo zupełnie nic.
function label(ac) {
  const callsign = (ac.flight || '').trim()
  if (callsign) return callsign
  const common = getCommonName(ac.t)
  if (common) return common.split('/')[0].trim()
  const code = (ac.t || '').trim()
  return code || ac.hex || '?'
}

// `aircraft` to snapshot z blobu, który i tak zapisuje aircraft.js — zero
// dodatkowych zapytań do adsb.fi.
export function readAdsbSignals(aircraft) {
  if (!Array.isArray(aircraft)) return { ok: false, milOverPoland: 0, isr: [], tankers: [] }
  let milOverPoland = 0
  const isr = []
  const tankers = []
  for (const ac of aircraft) {
    if ((ac.kind || 'mil') !== 'mil') continue
    if (!isInPoland(ac.lat, ac.lon)) continue
    if (ac.on_ground) continue
    milOverPoland++
    const type = normType(ac.t)
    if (ISR_TYPES.has(type)) isr.push(label(ac))
    else if (TANKER_TYPES.has(type)) tankers.push(label(ac))
  }
  // Bez odsiania powtórek dwa KC-135 bez znaku wywoławczego dałyby powód
  // „tankowce: Stratotanker, Stratotanker".
  return { ok: true, milOverPoland, isr: [...new Set(isr)], tankers: [...new Set(tankers)] }
}

// Wagi dobrane tak, żeby SAM obraz z ADS-B nie potrafił nic podnieść, dopóki
// nie widać realnej nadwyżki maszyn. Powód z produkcji: przy zupełnie spokojnym
// niebie i zerowych alarmach w Ukrainie dwa tankowce plus siedem maszyn nad
// normę zapalały wszystkie sześć województw na „obserwację". Dwa tankowce nad
// Polską to rutyna, a warstwa, która świeci codziennie, uczy się ignorować.
//
// Stąd podział ról: ISR i tankowce POTWIERDZAJĄ, nadwyżka ruchu ALARMUJE.
// Suma samego ISR i tankowców (8 + 4 = 12) celowo NIE dosięga progu
// „obserwacji" (15) — bez nadwyżki ruchu albo alarmu w Ukrainie nic się nie
// zapala. Podlaskie i warmińsko-mazurskie, które nie mają żadnego feedu
// alarmowego, może więc podnieść wyłącznie realny skok liczby maszyn.
const ISR_POINTS = 8
const TANKER_POINTS = 4
// Pojedynczy tankowiec nad Polską lata praktycznie codziennie — dopiero para
// jest czymkolwiek wartym odnotowania.
const TANKER_MIN_COUNT = 2

// Nadwyżka musi być JEDNOCZEŚNIE proporcjonalna i bezwzględna: liczba maszyn
// w prostokącie obserwacji naturalnie skacze o kilka w obie strony, więc sam
// warunek „więcej niż norma" łapał zwykłe wahanie popołudnia.
const SURGE_RATIO = 1.75
const SURGE_MIN_ABSOLUTE = 4
const SURGE_POINTS_PER_AIRCRAFT = 2
const SURGE_CAP = 15
const ADSB_PART_CAP = 25

// Ile maszyn wojskowych nad Polską to „normalny dzień”. Liczone jako średnia
// wykładnicza z kolejnych odczytów (patrz updateBaseline) — bez tego nie da się
// odróżnić wzmożonego ruchu od zwykłego popołudnia. BASELINE_DEFAULT służy
// wyłącznie za bezpiecznik: przy zimnym starcie wywołujący zasiewa normę
// pierwszym realnym odczytem (patrz threat.js), żeby nie ogłosić wzmożenia
// tylko dlatego, że nie mieliśmy jeszcze z czym porównać.
// Wolno, celowo: przy odczycie mniej więcej co minutę alfa 0,05 dawała czas
// połowicznego zaniku ~14 minut, więc norma doganiała wzmożenie, zanim zdążyło
// cokolwiek znaczyć. 0,01 to ~69 minut — kilkugodzinny podwyższony ruch nadal
// w końcu stanie się nową normą, i tak ma być.
export const BASELINE_ALPHA = 0.01
export const BASELINE_DEFAULT = 3

// Norma zapisana starą definicją „maszyn nad Polską" (prostokąt łapiący Czechy
// i Kaliningrad) była mniej więcej dwukrotnie zawyżona, więc po zmianie na
// granice nie znaczy już nic. Zmiana wersji unieważnia stary rekord i każe
// zasiać normę od nowa pierwszym realnym odczytem — bez ręcznego grzebania
// w blobach. Przy KAŻDEJ kolejnej zmianie definicji licznika podbij tę stałą.
export const BASELINE_VERSION = 2

export function updateBaseline(prev, milOverPoland) {
  if (!Number.isFinite(milOverPoland)) return prev ?? BASELINE_DEFAULT
  if (!Number.isFinite(prev)) return milOverPoland
  return prev + BASELINE_ALPHA * (milOverPoland - prev)
}

export function scoreAdsb(signals, baseline) {
  if (!signals?.ok) return { points: 0, surge: 0, excess: 0 }
  const base = Number.isFinite(baseline) ? baseline : BASELINE_DEFAULT
  const excess = signals.milOverPoland - base

  const isSurge = signals.milOverPoland >= base * SURGE_RATIO && excess >= SURGE_MIN_ABSOLUTE
  const surge = isSurge
    ? Math.min(SURGE_CAP, Math.round(excess * SURGE_POINTS_PER_AIRCRAFT))
    : 0

  const points = Math.min(
    ADSB_PART_CAP,
    (signals.isr.length ? ISR_POINTS : 0) +
    (signals.tankers.length >= TANKER_MIN_COUNT ? TANKER_POINTS : 0) +
    surge
  )
  return { points, surge, excess }
}

// ── Złożenie całości ──────────────────────────────────────────────────────
export function buildThreatState({ ua, adsb, baseline, now = Date.now() }) {
  const active = new Set((ua?.alerts || []).map(a => a.key))
  const byKey = new Map((ua?.alerts || []).map(a => [a.key, a]))
  const { points: adsbPoints, surge } = scoreAdsb(adsb, baseline)

  const regions = REGIONS.map(r => {
    const front = r.front.filter(k => active.has(k))
    const second = r.second.filter(k => active.has(k))
    const uaPart = Math.min(UA_PART_CAP, front.length * FRONT_POINTS + second.length * SECOND_POINTS)
    const score = Math.min(100, uaPart + adsbPoints)

    const reasons = []
    for (const k of front) reasons.push(`alarm w obwodzie ${byKey.get(k).pl} (granica)`)
    for (const k of second) reasons.push(`alarm w obwodzie ${byKey.get(k).pl} (druga linia)`)
    if (adsb?.isr?.length) reasons.push(`rozpoznanie NATO w powietrzu: ${adsb.isr.join(', ')}`)
    // Tankowce wymieniamy tylko wtedy, gdy realnie punktowały — inaczej powód
    // tłumaczyłby poziom czymś, co się do niego nie dołożyło.
    if (adsb?.tankers?.length >= TANKER_MIN_COUNT) {
      reasons.push(`tankowce nad Polską: ${adsb.tankers.join(', ')}`)
    }
    if (surge > 0) {
      const norm = Number.isFinite(baseline) ? Math.round(baseline) : BASELINE_DEFAULT
      reasons.push(`wzmożony ruch wojskowy (${adsb.milOverPoland} maszyn, norma ~${norm})`)
    }

    return { id: r.id, name: r.name, score, level: levelFor(score), reasons }
  })

  const score = regions.reduce((max, r) => Math.max(max, r.score), 0)

  return {
    level: levelFor(score),
    score,
    updatedAt: new Date(now).toISOString(),
    regions,
    signals: {
      ua: {
        ok: !!ua?.ok,
        alerts: ua?.alerts || [],
        source: 'ubilling.net.ua/aerialalerts',
      },
      adsb: {
        ok: !!adsb?.ok,
        milOverPoland: adsb?.milOverPoland ?? 0,
        isr: adsb?.isr || [],
        tankers: adsb?.tankers || [],
        baseline: Number.isFinite(baseline) ? Math.round(baseline * 10) / 10 : null,
      },
    },
    disclaimer: 'Szacunek własny, nie komunikat urzędowy. Liczony z alarmów ' +
      'w przygranicznych obwodach Ukrainy i ruchu wojskowego widocznego w ADS-B. ' +
      'Źródłem ostrzeżeń dla Polski pozostaje RCB.',
  }
}

// ── Progi dla powiadomień push ────────────────────────────────────────────
// Push leci przy WZROŚCIE poziomu, nie przy każdym przeliczeniu. Stan „o czym
// już powiadomiliśmy” trzymamy per województwo: { [regionId]: { level, ts } }.
export const LEVEL_RANK = { calm: 0, watch: 1, elevated: 2, high: 3 }

// Poniżej tego poziomu nie budzimy nikogo. „Obserwacja” zapala się już przy
// samym rozpoznaniu NATO w powietrzu, co nad wschodnią Polską zdarza się
// regularnie — push o tym byłby szumem, a szum uczy ignorować alerty.
export const PUSH_MIN_LEVEL = 'elevated'

// Spadek poziomu zapisujemy dopiero po tym czasie. Bez tego histereza nie
// istnieje: alarm w obwodzie lwowskim gaszony i wznawiany co kilka minut
// (a tak to wygląda podczas nalotu) wysyłałby push za każdym nawrotem.
export const DEESCALATION_DELAY_MS = 20 * 60 * 1000

function rankOf(level) {
  return LEVEL_RANK[level] ?? 0
}

// Zwraca województwa, które WŁAŚNIE przekroczyły próg, oraz nowy stan do zapisu.
// `prevNotified` bierzemy z bloba; pusty (pierwszy przebieg po deployu) znaczy
// „nic jeszcze nie ogłoszone” — jeśli w tym momencie coś jest podniesione,
// powiadomienie pójdzie, i tak ma być: ktoś, kto właśnie włączył push podczas
// realnego zagrożenia, ma się o nim dowiedzieć.
export function diffThreatForPush(prevNotified, state, now = Date.now()) {
  const prev = (prevNotified && typeof prevNotified === 'object') ? prevNotified : {}
  const minRank = rankOf(PUSH_MIN_LEVEL)
  const raised = []
  const next = {}

  for (const region of state?.regions || []) {
    const rank = rankOf(region.level)
    const before = prev[region.id]
    const beforeRank = rankOf(before?.level)

    if (rank > beforeRank) {
      next[region.id] = { level: region.level, ts: now }
      if (rank >= minRank) {
        raised.push({
          id: region.id,
          name: region.name,
          level: region.level,
          score: region.score,
          reasons: region.reasons || [],
        })
      }
    } else if (rank < beforeRank && now - (before?.ts || 0) < DEESCALATION_DELAY_MS) {
      next[region.id] = before          // histereza — jeszcze nie schodzimy
    } else if (rank < beforeRank) {
      next[region.id] = { level: region.level, ts: now }
    } else {
      next[region.id] = before || { level: region.level, ts: now }
    }
  }

  // Wpisy „calm” nie niosą informacji (brak wpisu znaczy to samo), a blob ma
  // zostać mały i czytelny w diagnostyce.
  for (const [id, rec] of Object.entries(next)) {
    if (rankOf(rec?.level) === 0) delete next[id]
  }

  return { raised, next }
}
