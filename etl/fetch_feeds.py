"""CityPulse ETL: GTFS-realtime VehiclePositions -> compact JSON snapshots.

Why this runs in GitHub Actions, not the browser: browsers can't fetch most
GTFS-RT endpoints (no CORS headers), and protobuf parsing belongs server-side.
The Action runs every 5 minutes and commits data/live/<city>.json only when
vehicle data actually changed. The static site then loads same-origin JSON —
no keys, no CORS, GitHub Pages-ready.

Usage: python fetch_feeds.py [--check]   # --check = dry run, no writes
"""
import datetime
import json
import os
import sys

import requests
from google.transit import gtfs_realtime_pb2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# GTFS-RT occupancy_status -> plain language + meter fill (0-100).
OCCUPANCY = {
    0: ("Empty", 5),
    1: ("Many seats available", 25),
    2: ("Few seats available", 55),
    3: ("Standing room only", 80),
    4: ("Crushed standing room only", 95),
    5: ("Full", 100),
    6: ("Not accepting passengers", 100),
    7: (None, None),          # NO_DATA_AVAILABLE -> unknown, not zero
    8: ("Not boardable", 0),
}


def fetch(feed: dict) -> dict:
    """Fetch + parse one feed into the CityPulse snapshot format."""
    r = requests.get(feed["vehicle_positions_url"], timeout=45)
    r.raise_for_status()
    msg = gtfs_realtime_pb2.FeedMessage()
    msg.ParseFromString(r.content)

    with open(os.path.join(ROOT, "data", "static",
                           f"{feed['city_id']}_routes.json")) as f:
        routes = json.load(f)["routes"]

    vehicles = []
    occ_seen = 0
    for e in msg.entity:
        if not e.HasField("vehicle"):
            continue
        v = e.vehicle
        if not v.position.HasField("latitude"):
            continue
        route_id = v.trip.route_id if v.HasField("trip") else ""
        meta = routes.get(route_id, {})
        occ = v.occupancy_status if v.HasField("occupancy_status") else 7
        _, pct = OCCUPANCY.get(occ, (None, None))
        if occ not in (7,):
            occ_seen += 1
        # Lean wire format: occupancy_label is derived client-side from the
        # occupancy code (single lookup table in web/city.js); null bearing /
        # speed keys are omitted rather than serialized as null.
        rec = {
            "id": v.vehicle.id if v.HasField("vehicle") else e.id,
            "route": route_id or None,
            "route_label": meta.get("label") or route_id or None,
            "route_type": meta.get("type"),
            "lat": round(v.position.latitude, 4),
            "lon": round(v.position.longitude, 4),
            "occupancy": occ,
            "occupancy_pct": pct,
        }
        if v.position.HasField("bearing"):
            rec["bearing"] = round(v.position.bearing, 1)
        if v.position.HasField("speed"):
            rec["speed"] = round(v.position.speed * 2.23694, 1)  # m/s -> mph
        vehicles.append(rec)

    now = datetime.datetime.now(datetime.timezone.utc)
    return {
        "city": feed["city_id"],
        "agency": feed["agency"],
        "fetched_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "feed_url": feed["vehicle_positions_url"],
        "vehicles": vehicles,
        "stats": {
            "vehicles": len(vehicles),
            "with_occupancy": occ_seen,
            "routes_active": len({v["route"] for v in vehicles if v["route"]}),
        },
    }


def main() -> None:
    check = "--check" in sys.argv
    with open(os.path.join(ROOT, "data", "feeds.json")) as f:
        feeds = json.load(f)["feeds"]
    for feed in feeds:
        try:
            snap = fetch(feed)
        except Exception as exc:  # one bad feed must not kill the others
            print(f"{feed['city_id']}: FETCH FAILED: {exc}", flush=True)
            continue
        path = os.path.join(ROOT, "data", "live", f"{feed['city_id']}.json")
        old = None
        if os.path.exists(path):
            with open(path) as f:
                old = json.load(f)
        s = snap["stats"]
        changed = (old is None or old.get("vehicles") != snap["vehicles"])
        if not check:
            with open(path, "w") as f:
                json.dump(snap, f, separators=(",", ":"))
        print(f"{feed['city_id']}: {s['vehicles']} vehicles, "
              f"{s['routes_active']} routes, {s['with_occupancy']} w/ occupancy "
              f"({'changed' if changed else 'unchanged'})", flush=True)


if __name__ == "__main__":
    main()
