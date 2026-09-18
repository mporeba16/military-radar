<div align="center">

<img src="public/radar-icon.svg" width="88" alt="" />

# Radar Wojskowy

**Samoloty wojskowe, służbowe śmigłowce i największe transportowce nad Polską — na żywo, z powiadomieniem, gdy któryś pojawi się blisko Ciebie.**

[**radar-wojskowy.netlify.app**](https://radar-wojskowy.netlify.app)

![React 18](https://img.shields.io/badge/React-18-20232a?logo=react&logoColor=61dafb)
![Vite 5](https://img.shields.io/badge/Vite-5-20232a?logo=vite&logoColor=ffd62e)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-20232a?logo=leaflet&logoColor=a3d977)
![Netlify](https://img.shields.io/badge/Netlify-Functions%20%2B%20Blobs-20232a?logo=netlify&logoColor=32e6e2)
![PWA](https://img.shields.io/badge/PWA-instalowalna-20232a?logo=pwa&logoColor=a78bfa)

</div>

<p align="center">
  <img src="docs/screenshot-desktop.jpg" width="72%" alt="Mapa Europy Środkowej z samolotami wojskowymi, poligonami i lotniskami" />
  &nbsp;
  <img src="docs/screenshot-mobile.jpg" width="22%" alt="Karta C-17 Globemaster III na telefonie" />
</p>

## Co pokazuje

| | |
|---|---|
| **Wojsko** | maszyny oznaczone jako wojskowe w adsb.fi oraz rozpoznane samodzielnie — po blokach adresów ICAO, znakach wywoławczych (RCH, SAVER, DUKE…) i squawkach 7777 / 7400 |
| **Śmigłowce służbowe** | LPR, Policja, Straż Graniczna i zagraniczne służby ratunkowe — tylko potwierdzone wiropłaty |
| **Duże samoloty** | Boeing 747, An-124, An-225 |

Każdą kategorię można wyłączyć — znika wtedy z mapy i przestaje wysyłać alerty.

## Funkcje

- **Mapa na żywo** — odświeżanie co 5 s, płynny ruch ikon, ponad 40 sylwetek (myśliwce, tankowce, transportowce, śmigłowce, drony) w kolorze pułapu
- **Karta maszyny** — zdjęcie z Planespotters, typ, kraj, wysokość z trendem, prędkość, czas lotu i przewidywane lotnisko lądowania
- **Trasa lotu** — do 4 godzin historii zapisywanej po stronie serwera, także gdy nikt nie ma otwartej aplikacji
- **Powiadomienia push** — alert, gdy maszyna wleci w wybrany promień od Twojej pozycji, nawet przy zamkniętej aplikacji (na iPhonie po dodaniu do ekranu głównego)
- **Warstwy** — teren polskich lotnisk wojskowych (czerwony), główne bazy NATO (fioletowy) i 12 poligonów (pomarańczowy, kreskowany)
- **Sześć podkładów** — ciemny, klasyczny, satelita, neutralne ciemny i jasny, teren
- **PWA** — instaluje się jak aplikacja, działa na telefonie i komputerze

## Skąd dane

| Źródło | Do czego |
|---|---|
| [adsb.fi](https://opendata.adsb.fi) `/v2/mil` | globalna lista maszyn wojskowych |
| [adsb.fi](https://opendata.adsb.fi) `/v2/lat/…/lon/…/dist/250` | cały ruch nad Polską — stąd wyłapywane są maszyny, których `/mil` nie oznacza |
| [OpenSky Network](https://opensky-network.org) | zapas, gdy adsb.fi nie odpowiada (bez typu i rejestracji) |
| [Planespotters.net](https://www.planespotters.net) | zdjęcia maszyn |
| [OpenStreetMap](https://www.openstreetmap.org) | obrysy lotnisk i poligonów (ODbL) |

ADS-B nie podaje godziny startu, więc **czas lotu** to czas od pierwszego punktu trasy, jaki zna serwer — dolna granica, nie dokładna wartość.

## Jak to działa

```mermaid
flowchart LR
  A[adsb.fi / OpenSky] --> F[aircraft<br/>co 5 s na żądanie]
  A --> C[collect<br/>cron co 2 min]
  F --> B[(Netlify Blobs<br/>trasy 4 h)]
  C --> B
  F --> P[PWA<br/>React + Leaflet]
  B --> P
  A --> N[notify<br/>cron co 1 min]
  N -->|Web Push| P
```

| Funkcja | Rola |
|---|---|
| `aircraft` | pobiera i klasyfikuje ruch, zwraca trasę wybranej maszyny |
| `collect` | co 2 minuty zapisuje trasy w tle |
| `notify` | co minutę sprawdza zasięg subskrybentów i wysyła push |
| `subscribe` / `status` / `test-push` | zapis subskrypcji, diagnostyka, testowy push |

## Uruchomienie lokalne

```bash
npm install
npx netlify dev      # Vite + Netlify Functions
```

Sam `npm run dev` uruchomi interfejs bez funkcji — mapa zostanie pusta, a znacznik w rogu zaświeci na czerwono.

Powiadomienia wymagają kluczy VAPID (`npx web-push generate-vapid-keys`) — wzór w [`.env.example`](.env.example).

```bash
npm test             # vitest
npm run lint         # eslint
npm run build        # produkcja do dist/
```

Wdrożenie: każdy push na `main` buduje się automatycznie na Netlify.

## Struktura

```
netlify/functions/   aircraft, collect, notify, subscribe, status, test-push
  lib/               klasyfikacja wojska, granice Polski, bezpieczeństwo
src/
  components/        mapa, karta maszyny, panele, sylwetki SVG
  data/              obrysy lotnisk i poligonów
  lib/               paleta, geometria, nazwy typów, dopasowanie zdjęć
  airfields.js       lotniska: polskie wojskowe, cywilne, bazy NATO
test/                testy vitest
```
