# DATA_SOURCES.md — every feed below was fetched and parsed by hand on 2026-10-09.

## Live feeds (in production)

| City | Agency | VehiclePositions feed | Vehicles (sampled) | Occupancy | Delays | GTFS static |
|---|---|---|---|---|---|---|
| Boston | MBTA | `https://cdn.mbta.com/realtime/VehiclePositions.pb` | ~690 | Buses only; rail/ferry report `NO_DATA_AVAILABLE` | Not published in GTFS-RT | `https://cdn.mbta.com/MBTA_GTFS.zip` (406 routes, verified) |
| Denver | RTD | `https://www.rtd-denver.com/google_sync/VehiclePosition.pb` | ~610 | Fleet-wide | Not published in GTFS-RT | `https://www.rtd-denver.com/files/gtfs/google_transit.zip` (130 routes, verified) |

Notes:
- MBTA route IDs are public-facing (`87`, `116`, `Red`, `CR-Lowell`); vehicle IDs are real fleet numbers (`y2011`, `R-548C0C78`).
- RTD route IDs are public-facing (`15`, `15L`, `BOLT`, `FREE`); ~15% of vehicles report no trip (deadheading) and are shown without a route.
- Neither feed publishes speed reliably (MBTA: no; RTD: ~3%) — the UI shows "—" rather than guessing.
- Neither feed publishes schedule delays in GTFS-RT — the copilot says so explicitly instead of inventing them.

## Evaluated but excluded

| Feed | Result |
|---|---|
| TriMet Portland | Requires API key — excluded (zero-key principle) |
| CTA Chicago | Not GTFS-RT protobuf (proprietary JSON API) — excluded |
| BART / SEPTA / VTA / DART / Metro Transit MN | 404 or key-gated at probed endpoints |
| King County Metro Seattle | **Realtime verified**: 374 vehicles, occupancy 8/8, delays 50/50 at `s3.amazonaws.com/kcm-alerts-realtime-prod/vehiclepositions.pb`. **Excluded for now**: route IDs are internal (`100001`) and the GTFS static bundle was unreachable from the build network, so route names couldn't be honestly resolved. Revisit when static is reachable. |

## Honesty rules

1. "LIVE" badge = snapshot fetched within the last 30 minutes by the Action ETL. Older = "SNAPSHOT".
2. Every vehicle card shows the snapshot timestamp ("updated Xm ago").
3. Occupancy `NO_DATA_AVAILABLE` renders as "Unknown" (grey), never as empty.
4. If a feed fetch fails, the Action keeps the last good snapshot and the UI keeps its timestamp — stale data is labeled, never silently served as fresh.
