# Military Radar

Real-time military aircraft tracking for Europe and Poland. Built as a Progressive Web App with live ADS-B data, flight trail history, and push notifications.

**Live:** [radar-wojskowy.netlify.app](https://radar-wojskowy.netlify.app)

---

## Features

- **Real-time tracking** — aircraft positions refreshed every 5 seconds
- **Military filtering** — ICAO hex prefixes, callsign patterns, and squawk codes used to identify military traffic across 20+ NATO nations
- **Three view modes** — Europe-wide (2800 km radius), Poland (400 km), or GPS-centered with custom radius
- **Flight trails** — 15-minute client-side trail + 4-hour server-side trail history via Netlify Blobs
- **Aircraft info panel** — type, altitude, speed, heading, registration, country flag, photo from Planespotters.net
- **Altitude color scale** — color-coded icons from red (0 m) through yellow (1200 m), green, teal, blue to purple (12 000+ m)
- **SVG aircraft shapes** — 40+ distinct shapes: fighters, bombers, transports, helicopters, UAVs
- **Push notifications** — Web Push alerts when military aircraft enter GPS radius, works when app is closed
- **Multiple map layers** — OSM ADSBx, Carto Voyager, OpenStreetMap, Esri Satellite
- **PWA** — installable, works offline (last cached data)

---

## Data Sources

| Source | Endpoint | Purpose |
|--------|----------|---------|
| [adsb.fi](https://opendata.adsb.fi) | `/api/v2/mil` | Global military aircraft database |
| [adsb.fi](https://opendata.adsb.fi) | `/api/v2/lat/{lat}/lon/{lon}/dist/{nm}` | Geographic supplement for untagged military traffic |
| [OpenSky Network](https://opensky-network.org) | `/api/states/all` | Fallback when adsb.fi is unavailable |
| [Planespotters.net](https://www.planespotters.net) | `/pub/photos/hex/{hex}` | Aircraft photos |

No API key required for anonymous use. adsb.fi and OpenSky have rate limits for unauthenticated requests.

---

## Military Detection Logic

An aircraft is classified as military if it matches **any** of:

1. **ICAO hex prefix** — blocks allocated exclusively to military (e.g. `AE` for USAF/USN/USMC, `43C–43F` for Bundeswehr, `478` for Norwegian Luftforsvaret, etc.)
2. **Callsign pattern** — known military callsign prefixes (RCH, ASCOT, MAGMA, SAVER, GAF, CZAF, etc.)
3. **Squawk code** — `7777` (intercept) or `7400` (lost link)

Civilian airline callsigns (LOT, RYR, DLH, BAW, etc.) are always excluded even if hex matches.

Synthetic/test addresses are filtered out:
- Sequential byte pattern (e.g. `0x44-0x55-0x66`)
- TIS-B temporary addresses ending in `0xFFF`
- Null or all-identical-byte addresses

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5 |
| Maps | Leaflet 1.9.4, React Leaflet 4 |
| PWA | vite-plugin-pwa (Workbox, generateSW) |
| Backend | Netlify Functions (Node 20, ES modules) |
| Storage | Netlify Blobs (flight trail persistence) |
| Push | Web Push (VAPID), Service Worker |
| Deployment | Netlify (auto-deploy from `main`) |

---

## Project Structure

```
├── netlify/
│   └── functions/
│       ├── aircraft.js      # Aircraft data fetching + trail storage
│       ├── subscribe.js     # Web Push subscription management
│       └── notify.js        # Scheduled push notification delivery
├── public/
│   ├── push-handler.js      # Service worker push event handler
│   └── pwa-*.png            # PWA icons
└── src/
    ├── api.js               # Client-side API helpers
    ├── App.jsx              # Root component, state, polling loop
    ├── components/
    │   ├── RadarMap.jsx         # Leaflet map, markers, trails, legend
    │   ├── AircraftInfoPanel.jsx # Selected aircraft details
    │   └── aircraftShapes.js    # SVG shapes, color scale, ICAO type mapping
    └── hooks/
        ├── useGeolocation.js       # watchPosition with auto-start
        └── usePushNotifications.js # VAPID subscription flow
```

---

## Local Development

```bash
npm install
netlify dev          # runs Vite + Netlify Functions locally
```

Requires [Netlify CLI](https://docs.netlify.com/cli/get-started/).

For push notifications and trail persistence, set environment variables in Netlify dashboard or `.env`:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
OPENSKY_USER=...      # optional — raises OpenSky rate limit
OPENSKY_PASS=...
```

---

## Deployment

```bash
netlify deploy --prod
```

Netlify automatically builds and deploys on push to `main`. Build command: `npm run build`, publish directory: `dist`.

---

## Data Filtering Details

### Altitude cap
Aircraft reporting above **60 000 ft (18 300 m)** are excluded — phantom tracks in adsb.fi sometimes carry invalid Mode-C altitude readings.

### Supplement geographic query
The adsb.fi `/mil` endpoint does not tag every military aircraft. A second geographic query fetches all aircraft within radius and applies our own hex/callsign filters, catching traffic missed by the global database.

### ICAO hex → country lookup
Country is derived client-side from the ICAO 24-bit address range table (80+ countries) and displayed with emoji flag in the info panel.
