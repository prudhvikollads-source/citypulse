#!/bin/bash
# CityPulse quickstart: venv -> deps -> tests -> ETL dry run -> serve.
set -e
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/pip install -q -r etl/requirements.txt -r requirements.txt
.venv/bin/python -m pytest tests/ -q
.venv/bin/python etl/fetch_feeds.py --check
echo ""
echo "OK. Starting local server — open http://localhost:8000/web/"
python3 -m http.server 8000
