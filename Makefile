install:
	python3 -m venv .venv && .venv/bin/pip install -r etl/requirements.txt -r requirements.txt

test:
	.venv/bin/python -m pytest tests/ -q

etl:
	.venv/bin/python etl/fetch_feeds.py

etl-check:
	.venv/bin/python etl/fetch_feeds.py --check

serve:
	python3 -m http.server 8000

demo: serve

clean:
	rm -rf .venv __pycache__ */__pycache__
