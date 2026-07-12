# Plan naprawczy — Military Radar (v2.2.0)

Plan do wykonania przez agenta (Opus). Wykonuj etapy w kolejności; po każdym etapie
uruchom `npm run build` (musi przejść bez błędów) i zrób osobny commit.
Nie zmieniaj zachowania UI ani wyglądu aplikacji, o ile zadanie nie mówi inaczej.
Po zakończeniu podbij wersję w `package.json` (patch/minor wg skali zmian).

---

## ETAP 1 — Bezpieczeństwo i higiena danych (P0)

### 1.1 Usunięcie martwego, niezabezpieczonego modułu auth
**Pliki:** `netlify/functions/auth-login.js`, `auth-send-code.js`, `auth-verify-code.js`,
`auth-change-password.js`, `netlify/functions/lib/auth.js`, `src/hooks/useAuth.js`

Frontend nigdzie nie używa auth (`useAuth` nie jest importowany, żaden komponent nie
woła endpointów `auth-*`), a mimo to funkcje są wdrożone publicznie i mają poważne braki:

- brak jakiegokolwiek rate-limitu → brute-force hasła (`auth-login`) oraz 6-cyfrowego
  kodu (`auth-verify-code` — 10-minutowe okno, zero licznika prób),
- `auth-send-code` pozwala każdemu wysyłać e-maile przez Resend bez limitu
  (koszty + reputacja domeny) i nadpisywać cudzą oczekującą rejestrację,
- `signJWT` nie waliduje `process.env.JWT_SECRET` — przy braku env podpisuje tokeny
  literalnym `"undefined"`,
- `HEADERS` w `lib/auth.js` ustawia `Access-Control-Allow-Origin: *`, omijając
  allowlistę z `lib/security.js`.

**Zadanie:** usuń wszystkie wymienione pliki (są w historii gita, łatwo przywrócić,
gdy funkcja logowania faktycznie powstanie). Sprawdź `grep -r "auth" src/`,
że nic się nie wywraca. Jeśli w env Netlify są `JWT_SECRET`/`RESEND_API_KEY`/
`TEST_USER_*`, zostaw je — nie ruszaj konfiguracji zdalnej.

**Kryterium:** build przechodzi, `netlify/functions` zawiera tylko: aircraft, collect,
notify, status, subscribe, test-push + lib/{military,security}.js.

### 1.2 Nieograniczony przyrost blobów `push-runs`
**Plik:** `netlify/functions/notify.js` (funkcja `writeRunStats`, ~linia 213)

Cron działa co minutę i każdy run zapisuje nowy blob `run-${runStart}` — nic tego nie
sprząta (≈1440 blobów dziennie, pół miliona rocznie). Dodatkowo `stats.perSub` z pełną
diagnostyką ląduje w każdym snapshotcie.

**Zadanie:** zostaw zapis `latest` (używa go `status.js`), a historię per-run
ogranicz: albo usuń zapis `run-*` całkiem, albo po zapisie skasuj wpisy starsze niż
24 h (`runsStore.list()` + delete kluczy `run-<ts>` z ts < now-24h; rób to np. tylko
raz na godzinę, gdy `runStart % 3600000 < 60000`, żeby nie listować co minutę).
Rekomendacja: usunąć zapis `run-*` — nikt go nie czyta.

### 1.3 Walidacja parametru `hex` w trybie trail
**Plik:** `netlify/functions/aircraft.js` (~linia 500)

`?hex=` trafia bez walidacji jako klucz do blob store. Klient zawsze wysyła 6 znaków
hex, więc dodaj na wejściu: `if (!/^[0-9a-f]{6}$/i.test(hex)) return 400`.

### 1.4 Nieograniczony przyrost blobów `rate-limit`
**Plik:** `netlify/functions/lib/security.js` (funkcja `rateLimit`)

Każdy klucz (`sub-*`, `st-*`, `tp-*`) zostaje w store na zawsze. Skala mała, ale to
ten sam wzorzec co 1.2. **Zadanie:** minimalny fix — przy zapisie dodaj do rekordu
`ts`, a w `notify.js` (który i tak działa co minutę) raz na dobę przejdź store
`rate-limit` i skasuj wpisy starsze niż 24 h. Alternatywnie zostaw i tylko odnotuj
w komentarzu — decyzja wykonawcy; priorytet niski w tym etapie.

---

## ETAP 2 — Poprawność (P1)

### 2.1 Deduplikacja logiki klasyfikacji (już się rozjechała)
**Pliki:** `netlify/functions/aircraft.js` i `netlify/functions/lib/military.js`

Reguły wojskowe (regexy callsignów, prefiksy hex, squawki, heli/heavy) istnieją
w DWÓCH kopiach „trzymanych w synchronie" ręcznie — i już driftują:

- supplement geo w `military.js#fetchMilitaryNear` NIE sprawdza `MILITARY_SQUAWKS`,
  podczas gdy `aircraft.js#isMilitaryADSBfi` sprawdza;
- fallback OpenSky w `military.js` nie filtruje `isSuspiciousHex` ani pułapu
  ≤18300 ft, które `aircraft.js#tryOpenSky` stosuje.

**Zadanie:** przenieś całą klasyfikację do `lib/military.js` jako jedyne źródło
(wyeksportuj to, czego potrzebuje `aircraft.js`: listy wzorców, `isSuspiciousHex`,
`isMilitaryADSBfi`, `classifyExtra`, `isInPoland`/`passesTypeNoise` mogą zostać w
aircraft.js — są używane tylko tam). `aircraft.js` importuje zamiast duplikować.
Przy scalaniu ujednolić na wariant BEZPIECZNIEJSZY (ze sprawdzaniem squawk,
suspicious hex i pułapu w OpenSky). Zachowaj identyczne wyniki klasyfikacji dla
danych adsb.fi — to najważniejsza ścieżka.

**Kryterium:** brak zduplikowanych tablic regexów; `grep -c "MILITARY_CALLSIGN_PATTERNS" netlify/` → definicja w jednym pliku.

### 2.2 Utrata cooldownu przy przerwanym runie notify
**Plik:** `netlify/functions/notify.js` (`processSubscription`)

Mapy cooldownów (`alertedStore.set`) zapisywane są dopiero PO wysłaniu wszystkich
powiadomień danej subskrypcji. Netlify scheduled function ma limit czasu (domyślnie
10 s) — przy wielu subskrypcjach/wysyłkach run może zostać ubity w połowie: pushe
wyszły, cooldown niezapisany → następny run (za minutę) wysyła te same alerty drugi
raz. **Zadanie:** zapisz mapę cooldownów od razu po wyznaczeniu `newNear/newFar/
newHeavy/newHeli` (przed wysyłkami), a nie po. Trade-off (push może się nie wysłać,
a cooldown zostanie) jest akceptowalny — pojedynczy zgubiony alert jest lepszy niż
powtarzające się duplikaty, z którymi ta appka już walczyła (patrz komentarze o iOS).
Dodatkowo: pomiń `alertedStore.set`, gdy mapa się nie zmieniła (oszczędza 1 zapis
blob / minutę / subskrypcję).

### 2.3 Wyciek pamięci `trailCache` w warm lambdzie
**Plik:** `netlify/functions/aircraft.js` (`saveTrails`, ~linia 113)

`trailCache` (Map hex → punkty) rośnie bez ograniczeń — wpisy maszyn, które zniknęły,
nigdy nie są usuwane. **Zadanie:** na końcu `saveTrails` usuń z `trailCache` wpisy,
których ostatni punkt jest starszy niż `TRAIL_MAX_AGE_MS`, albo których hex nie
wystąpił w ostatnich N wywołaniach. Prosty wariant: jeśli `trailCache.size > 500`,
usuń wpisy z najstarszym ostatnim punktem.

### 2.4 Niespójny opis częstotliwości serwera
**Plik:** `src/i18n.js` (`PUSH_DESCRIPTION`)

Tekst mówi „Sprawdzane co 5 minut przez serwer", a cron `notify` działa co minutę
(`netlify.toml`). Popraw tekst na „co minutę" (albo — jeśli celowo chcesz rzadziej —
zmień cron; decyzja: popraw tekst, cron zostaje).

### 2.5 Błędne przypisanie operatora BAH
**Plik:** `src/lib/photoMatch.js` (~linia 27)

`[/^(BUAF|BAH)/, 'bulgarian']` — BAH to Bahrain Amiri Air Force (tak klasyfikuje go
`AircraftInfoPanel.jsx` i `military.js`), a nie Bułgaria. Rozdziel: `BUAF` → bulgarian,
`BAH` → bahrain (planespotters slug: `bahrain`).

### 2.6 Martwa konfiguracja ikon Leaflet z unpkg
**Plik:** `src/components/RadarMap.jsx` (linie 10–15)

`L.Icon.Default.mergeOptions` wskazuje na CDN unpkg, ale aplikacja używa wyłącznie
`L.divIcon` — domyślne markery nigdy się nie renderują. To martwy kod i jedyny
zewnętrzny hardcode CDN (psuje pełny offline PWA, gdyby kiedyś powstał default
marker). **Zadanie:** usuń cały blok (delete + mergeOptions).

---

## ETAP 3 — Koszty i wydajność (P2)

### 3.1 Podwójny zapis tras: live handler + collect cron
**Pliki:** `netlify/functions/aircraft.js` (handler, ~linia 574), `collect.js`

`saveTrails` wykonuje się przy każdym niecache'owanym żądaniu live (co ~9 s przy
aktywnym kliencie) ORAZ w cronie collect co 2 min — dublujące się zapisy blobów.
Serwerowa trasa i tak jest próbkowana co 15 s minimum, a klient ma własny trail
lokalny do bieżącej sesji. **Zadanie:** usuń wywołanie `saveTrails` z handlera live
w `aircraft.js` (zostaw eksport — używa go `collect.js`). Trasa serwerowa będzie
mieć rozdzielczość ~2 min (cron), co odpowiada temu, co i tak widzi użytkownik po
ponownym wejściu; klientowy trail (5 s poll) pokrywa bieżące oglądanie.
UWAGA: to zmiana zachowania (rzadsze punkty serwerowe) — jeśli użytkownik chce
zachować gęstą trasę serwerową, zamiast usuwać dodaj throttle (zapis nie częściej
niż co 60 s, timestamp w zmiennej modułowej). Wybierz throttle, jeśli masz wątpliwość.

### 3.2 Nagłówek cache na odpowiedzi /aircraft
**Plik:** `netlify/functions/aircraft.js`

Wszyscy klienci pytają o ten sam bbox (stały `EUROPE_CENTER`, radius 2800). Funkcja
ma własny snapshot-cache w blobach, ale każde żądanie to i tak inwokacja funkcji
(limit 125k/mies. na darmowym planie Netlify). **Zadanie:** dodaj do odpowiedzi live
(nie trail) nagłówek `'Cache-Control': 'public, max-age=0, s-maxage=5'` — CDN Netlify
zdedupuje równoległych klientów bez zmiany świeżości danych (poll co 5 s).

### 3.3 Zbędny refetch po zmianie promienia
**Plik:** `src/App.jsx` (efekt debounce `radius`, ~linia 292)

Zapytanie do API jest zawsze Europa/2800 km — zmiana promienia nie zmienia danych,
tylko lokalny filtr `_dist <= radius`. Debounce-refetch pali inwokację funkcji na
każde przesunięcie suwaka. **Zadanie:** zamiast `fetchDataRef.current()` przelicz
lokalnie stan alertów/inRange z bieżącego `aircraft` (wyciągnij logikę „inRange +
alerts" z `fetchData` do funkcji pomocniczej wywoływanej z obu miejsc). Jeśli
refaktor okaże się zbyt inwazyjny, zostaw refetch — oznacz to w commit message.

---

## ETAP 4 — Jakość: testy i lint (P2)

W repo nie ma ani jednego testu, lintera ani CI, a kod ma sporo czystych funkcji
pisanych „pod testy" (komentarz w `photoMatch.js` wprost to deklaruje).

### 4.1 Vitest + testy czystych funkcji
Dodaj `vitest` (devDependency) i skrypt `"test": "vitest run"`. Napisz testy dla:

- `src/lib/photoMatch.js` — `scorePhotoMatch`, `photoHasMatchSignal`,
  `typeSlugCandidates` (przypadki z komentarzy: PLF/C-295 reg 018 vs grecki F-16,
  hex stale → reg bonus),
- `src/lib/geo.js` — haversine/bearing (znane pary punktów),
- `netlify/functions/lib/military.js` — klasyfikacja: wojskowy callsign, cywilny
  wykluczony (LOT/RYR), ground station (XCAM), squawk 7777, heli (SP-HX + typ),
  heavy (B744, callsign ADB1234 bez typu), suspicious hex (0xAAAAAA, 0x445566,
  xxxFFF),
- `netlify/functions/notify.js` — `dedupeByDevice` (rekordy bez deviceId
  nietknięte, wygrywa najświeższy updatedAt),
- `src/components/SettingsPanel.jsx` — wyeksportuj `rangePosToKm`/`rangeKmToPos`
  (lub przenieś do `src/lib/`) i przetestuj round-trip dla 25/100/250/500.
- trail utils z `aircraft.js`: `currentFlightOnly`, `filterImplausibleJumps` —
  wyeksportuj je (są już na poziomie modułu).

### 4.2 ESLint
Dodaj flat-config ESLint z `eslint-plugin-react-hooks` (kod już używa dyrektyw
`eslint-disable-line react-hooks/exhaustive-deps`, a lintera nie ma). Skrypt
`"lint": "eslint src netlify"`. Napraw tylko realne błędy; do stylistycznych reguł
nie dokręcaj śruby.

### 4.3 Error boundary
**Plik:** `src/main.jsx`

Wyjątek w React po zamontowaniu = biały/martwy ekran (fallback w index.html działa
tylko 10 s od startu). Dodaj prosty klasowy ErrorBoundary wokół `<App/>` z
komunikatem `BOOT_ERROR_TITLE`/`BOOT_ERROR_HINT` z i18n i przyciskiem przeładowania.

### 4.4 Drobny martwy kod
- `src/i18n.js`: aplikacja jest tylko po polsku, ale `AircraftInfoPanel.jsx`
  (~linia 208) ma martwą gałąź `getLang() === 'en'` — usuń warunek, zostaw 'od'.
- Nieużywane klucze i18n: `GPS_WAITING`, `GPS_FETCH`, `SETTINGS_FOOTER`,
  `SELECT_MAP`?, `OVERLAYS_LABEL`?, `ALT_LEGEND_LABEL`?, `ALTITUDE_LABEL`? —
  zweryfikuj grepem które są nieużywane i usuń (sprawdź też MapsPanel.jsx).
- `AltitudeLegend` w `RadarMap.jsx` — sprawdź, czy ktokolwiek go importuje;
  jeśli nie, usuń wraz ze stylami.

---

## ETAP 5 — Do weryfikacji / decyzje produktowe (nie wykonuj bez potwierdzenia)

1. **OpenSky fallback prawdopodobnie martwy:** OpenSky wycofał Basic Auth na rzecz
   OAuth2 (client credentials) — obecny kod z `Authorization: Basic` najpewniej
   dostaje 401/403 i fallback po cichu zwraca `null`. Zweryfikuj (curl) i jeśli tak:
   albo zaimplementuj OAuth2 token flow, albo usuń fallback i uprość komunikaty.
2. **Timeout funkcji notify:** przy wzroście liczby subskrypcji równoległe fetche +
   sekwencyjne pushe mogą przekraczać limit czasu scheduled function. Rozważ
   `[functions."notify"] timeout` w netlify.toml lub przejście na background function.
3. **Poll 5 s:** przy większej liczbie użytkowników rozważ 10 s (koszt inwokacji
   spada o połowę; UX niemal bez zmian przy animacji markerów 2,5 s).

---

## Weryfikacja końcowa

1. `npm run build` — bez błędów.
2. `npx vitest run` — wszystkie testy zielone.
3. `netlify dev` + smoke test: mapa się ładuje, samoloty widoczne, wybór samolotu
   pokazuje panel + trasę, panel ustawień działa, `/.netlify/functions/aircraft?hex=zzzzzz` → 400,
   `?hex=4d0000` → 200 z pustym trailem.
4. Przejrzyj `git diff --stat` — zmiany tylko w plikach wymienionych w planie.
