.PHONY: panel dry-run scrape scrape-full test

panel:
	python -m playstore_reviews.server --host 127.0.0.1 --port 8765

dry-run:
	python -m playstore_reviews --config config.yaml --dry-run

scrape:
	python -m playstore_reviews --config config.yaml

scrape-full:
	python -m playstore_reviews --config profiles/rappi-co-full.yaml

classify:
	python -m playstore_reviews.classify --threshold 0.8

test:
	python -m pytest -q
