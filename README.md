![Live](https://img.shields.io/badge/data-live%20GTFS--RT-22d3ee) ![Keys](https://img.shields.io/badge/API%20keys-zero-34d399) ![Tests](https://img.shields.io/badge/pytest-6%20passing-0A9EDC) ![License](https://img.shields.io/badge/License-MIT-green)

# 🚌 CityPulse — Live Transit Mission Control

### A mission control for your city's buses — then you realize the dots are real buses.

Spin a 3D globe, dive into Boston, Denver, Atlanta, Toronto, or Helsinki, and watch **live vehicles** move: each dot is a real bus, tram, or train reporting its position right now. Click one for its route number, fleet number, and how full it is. Ask the copilot which routes are packed. Every number on screen comes from a real GTFS-realtime feed — verified by hand, refreshed every 5 minutes, zero API keys.

> **Live demo:** GitHub Pages (enable on `web/`) · **Case study:** [`docs/index.html`](docs/index.html)

---

## 🌍 Why This Exists

Transit data is public but invisible. Agencies publish GTFS-realtime feeds — live positions, occupancy, delays — yet riders and planners stare at static schedules. CityPulse puts the live network on a globe you can spin, with an AI copilot that answers "which routes are packed right now?" from real data, not vibes.

## 🎛️ What This Thing Does

- **🌐 3D globe:** stylized Earth (procedural, no textures), cities pulse with live vehicle counts. Drag to spin, click to dive.
- **🗺️ Live city view:** MapLibre dark map with 3D buildings — every vehicle a glowing dot, colored by crowding (green → amber → red). Dots glide as positions refresh every 15s.
- **🎫 Vehicle cards:** click any bus — route number, fleet number, **how full** (plain-language occupancy + meter), speed, position. Unknown fields show "—", never guesses.
- **💬 Talk to CityPulse:** deterministic copilot over the live data — *"Which routes are most crowded?"*, *"Route 87 status"*, *"How many vehicles are running?"* — plus one-click **rush-hour brief** (PM-style markdown download: KPIs, hotspots, takeaways).
- **📊 KPI strip:** vehicles live, routes active, avg crowding, packed count — with honest "updated Xm ago" timestamps and LIVE/SNAPSHOT badges.
- **🔑 Keys are upgrades:** the copilot's analyst runs fully keyless on live data. Paste an OpenAI-compatible key in-app (localStorage only) to unlock open-ended conversation.

Measured 2026-10-09: **~4,350 vehicles** across Boston (~620), Denver (~640), Atlanta (~180), Toronto (~1,790), and Helsinki (~1,130); **776 routes**; refreshed every 5 min by GitHub Actions.

---

## ⚡ Quick Start

```bash
git clone https://github.com/prudhvikollads-source/citypulse.git
cd citypulse
./scripts/quickstart.sh   # venv -> deps -> tests -> ETL dry run -> serve
# open http://localhost:8000/web/
```

Or manually: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/web/`.

**Go live (GitHub Pages):** Settings → Pages → Deploy from branch → `main` → `/web`. The ETL workflow (`.github/workflows/etl.yml`) keeps `data/live/` fresh — add it via the web UI (the API blocks workflow files), and snapshots refresh every 5 minutes.

## 🕐 The First Five Minutes

1. **Spin the globe.** Five cities pulse across North America and Europe — the number is the live fleet.
2. **Dive into Toronto.** Click the marker (or the chip). ~1,790 dots bloom over the dark map.
3. **Click a red dot.** That's a packed bus — see its route, fleet number, and fill meter.
4. **Ask the copilot:** *"Which routes are most crowded?"* — real table, real numbers.
5. **Hit "rush-hour brief"** — a PM-style markdown brief downloads.

## 💬 Talk to It

- "How many vehicles are running right now?"
- "Which routes are most crowded?"
- "Route 15 status"
- "Generate a rush-hour brief"
- "Are there delays?" → honest answer: these feeds don't publish delays, so it won't invent them.

## 🏗️ Architecture

```
GTFS-RT feeds (MBTA, RTD)
        │  every 5 min
        ▼
GitHub Action ETL (etl/fetch_feeds.py)
  protobuf -> compact JSON, route names joined
        │  commit if changed
        ▼
data/live/<city>.json  (same-origin, no CORS, no keys)
        │
        ▼
Static 3D site (web/) ──► GitHub Pages
  globe.js (Three.js) · city.js (MapLibre) · copilot.js (analytical agent)
```

## 🔧 Key Engineering Decisions

1. **Action-ETL over direct browser fetch.** *Why:* GTFS-RT endpoints don't send CORS headers and protobuf parsing belongs server-side. The Action is the only moving part; the site is dumb static files.
2. **Static-first, GitHub Pages.** *Why:* free hosting, zero backend to babysit, and the 5-minute ETL gives "live" without websockets.
3. **Deterministic copilot core.** *Why:* every answer is computed from the actual snapshot — reproducible, no key, no hallucination. The LLM is an optional upgrade for open-ended chat, never the source of numbers.
4. **Prebuilt route lookups.** *Why:* GTFS static zips are 10–24 MB and change quarterly; realtime changes every 15 s. `etl/build_routes.py` bakes a 63 KB lookup once; the hot ETL stays fast.
5. **Honest unknown states.** *Why:* feeds omit fields (speed, delays, rail occupancy). "—" and "Unknown" beat invented data; the copilot explains *why* a number is missing.
6. **These two feeds.** *Why:* verified by actually parsing them — open, keyless, occupancy populated. Feeds needing keys or with unresolvable route IDs were cut (see DATA_SOURCES.md).

## Maps to your profiles

- **Data Engineer:** protobuf→JSON ETL on a 5-minute GitHub Actions schedule; compact wire format with nulls omitted; route names joined from GTFS static; same-origin JSON serving — no CORS, no keys.
- **Data Scientist:** live crowding analytics — vehicles live, routes active, crowding distribution, packed counts; honest unknown states ("—", never guesses) and snapshot-freshness badges.
- **AI Engineer:** deterministic analytical copilot computed from live snapshots — no hallucination possible; optional LLM upgrade path with a user-pasted key in localStorage only.
- **Product Manager:** rush-hour brief generator — KPIs, hotspots, takeaways as a downloadable markdown brief; "keys are upgrades" product decision; problem framed as public-but-invisible transit data.

## 📁 Project Structure

```
├── web/                  # static 3D app (GitHub Pages)
│   ├── index.html        # app shell
│   ├── app.js            # data loading, KPIs, view switching
│   ├── globe.js          # Three.js globe (procedural, no textures)
│   ├── city.js           # MapLibre city view + vehicle cards
│   └── copilot.js        # deterministic analytical agent + brief gen
├── etl/
│   ├── fetch_feeds.py    # Action ETL: protobuf -> JSON snapshots
│   └── build_routes.py   # GTFS static -> compact route lookups
├── data/
│   ├── feeds.json        # feed registry (add a city = one entry)
│   ├── cities.json       # city metadata
│   ├── static/           # route lookups (built, committed)
│   └── live/             # snapshots (ETL-refreshed; real snapshot bundled)
├── tests/test_etl.py     # schema, occupancy mapping, snapshot sanity
├── docs/index.html       # case-study page
└── .github/workflows/etl.yml  # every-5-min ETL (add via web UI)
```

## 🚀 What I'd Do Differently at Scale

- **More cities** via the feed registry: add a verified GTFS-RT URL to `data/feeds.json`, a GTFS-static route lookup via `etl/build_routes.py`, and a `data/cities.json` entry — the ETL, tests, and site pick it up with no code changes. (Snapshots over ~100KB are auto-sharded into `data/live/<city>/part-N.json`.)
- **TripUpdates** for true delay-vs-schedule where agencies publish it.
- **Dedup & history**: store snapshots in object storage, add a 24h crowding replay.

## 📋 Data

All feeds documented in [DATA_SOURCES.md](DATA_SOURCES.md) — what was verified, what was excluded, and why. Vehicle positions © their agencies (MBTA, RTD), used under their open data terms.
