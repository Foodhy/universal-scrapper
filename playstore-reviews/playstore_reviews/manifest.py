from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from playstore_reviews.config import Settings
from playstore_reviews.models import ScrapeResult


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def write_manifest(result: ScrapeResult, settings: Settings, excel_path: Path) -> Path:
    finished = datetime.now(timezone.utc).replace(tzinfo=None)
    payload = {
        "schema": 1,
        "finished_at_utc": _iso(finished),
        "excel": excel_path.name,
        "profile": settings.profile_name,
        "source": settings.source,
        "app_id": settings.app_id,
        "lang": settings.lang,
        "country": settings.country,
        "devices": settings.devices,
        "scores": settings.scores,
        "sort": settings.sort,
        "strategy": settings.strategy,
        "strategy_order": settings.strategy_order,
        "per_query_limit": settings.per_query_limit,
        "page_size": settings.page_size,
        "delay_seconds": settings.delay_seconds,
        "jitter_seconds": settings.jitter_seconds,
        "max_retries": settings.max_retries,
        "retry_backoff_seconds": settings.retry_backoff_seconds,
        "proxy_count": len(settings.proxies),
        "review_count": len(result.reviews),
        "stopped": result.stopped,
        "queries": [
            {
                "device": query.device,
                "score": query.score,
                "strategy": query.strategy,
                "fetched": query.fetched,
                "error": query.error,
            }
            for query in result.queries
        ],
    }
    path = excel_path.with_suffix(".json")
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
