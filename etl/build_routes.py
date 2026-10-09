"""Build compact route lookups from GTFS static zips.

Why a prebuilt lookup: the 5-minute ETL must stay fast and dependency-light.
Route metadata changes quarterly; realtime changes every 15 seconds. This
script runs manually (or monthly via workflow_dispatch) and commits a small
JSON the ETL loads in milliseconds.

Usage: python build_routes.py <gtfs.zip> <city_id>
Writes: data/static/<city_id>_routes.json
"""
import csv
import io
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TYPE_NAMES = {
    "0": "Tram", "1": "Subway", "2": "Rail", "3": "Bus",
    "4": "Ferry", "5": "Cable car", "6": "Gondola", "7": "Funicular",
}


def main() -> None:
    gtfs_path, city_id = sys.argv[1], sys.argv[2]
    with zipfile.ZipFile(gtfs_path) as z:
        rows = list(csv.DictReader(
            io.StringIO(z.read("routes.txt").decode("utf-8-sig"))))
    routes = {}
    for r in rows:
        short = (r.get("route_short_name") or "").strip()
        long = (r.get("route_long_name") or "").strip()
        label = short or long
        routes[r["route_id"]] = {
            "label": label,
            "short_name": short,
            "long_name": long,
            "type": TYPE_NAMES.get(r.get("route_type", ""), "Transit"),
            "color": (r.get("route_color") or "666666").strip() or "666666",
        }
    out_dir = os.path.join(ROOT, "data", "static")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"{city_id}_routes.json")
    with open(out, "w") as f:
        json.dump({"city": city_id, "routes": routes}, f)
    print(f"{city_id}: {len(routes)} routes -> {out} "
          f"({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
