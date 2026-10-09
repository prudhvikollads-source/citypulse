"""Tests for the CityPulse ETL: schema, occupancy mapping, snapshot sanity."""
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "etl"))

from fetch_feeds import OCCUPANCY  # noqa: E402

REQUIRED_VEHICLE_KEYS = {"id", "lat", "lon", "occupancy", "occupancy_pct"}
# occupancy_label is derived client-side from the code (web/city.js), not shipped.


def load(city):
    with open(os.path.join(ROOT, "data", "live", f"{city}.json")) as f:
        return json.load(f)


@pytest.mark.parametrize("city", ["boston", "denver"])
def test_snapshot_schema(city):
    d = load(city)
    assert d["city"] == city
    assert d["fetched_at"].endswith("Z")
    assert d["stats"]["vehicles"] == len(d["vehicles"]) > 100
    for v in d["vehicles"][:50]:
        assert REQUIRED_VEHICLE_KEYS <= set(v), f"missing keys in {v}"
        assert -90 <= v["lat"] <= 90 and -180 <= v["lon"] <= 180


def test_occupancy_mapping_covers_all_gtfs_codes():
    # GTFS-RT occupancy_status enum is 0..8 — every code must map explicitly.
    for code in range(9):
        assert code in OCCUPANCY, f"unmapped occupancy code {code}"
    label, pct = OCCUPANCY[1]
    assert label == "Many seats available" and pct == 25
    label, pct = OCCUPANCY[7]  # NO_DATA_AVAILABLE must NOT read as zero
    assert label is None and pct is None


def test_occupancy_values_in_snapshot_are_valid():
    for city in ("boston", "denver"):
        for v in load(city)["vehicles"]:
            assert v["occupancy"] in range(9), v
            label, pct = OCCUPANCY[v["occupancy"]]
            assert v["occupancy_pct"] == pct  # snapshot pct matches the map
            if v["occupancy"] == 7:
                assert label is None and pct is None
            # bearing/speed are omitted (not null) when the feed lacks them
            assert v.get("bearing") is None or isinstance(v["bearing"], (int, float))


def test_vehicle_ids_look_real():
    # Real agencies assign fleet numbers, not synthetic ids.
    for city in ("boston", "denver"):
        ids = [v["id"] for v in load(city)["vehicles"][:20]]
        assert all(i and i != "vehicle-1" for i in ids)


def test_feeds_registry_valid():
    with open(os.path.join(ROOT, "data", "feeds.json")) as f:
        feeds = json.load(f)["feeds"]
    assert len(feeds) >= 2
    for feed in feeds:
        assert feed["vehicle_positions_url"].startswith("https://")
        assert feed["city_id"] and feed["agency"]
