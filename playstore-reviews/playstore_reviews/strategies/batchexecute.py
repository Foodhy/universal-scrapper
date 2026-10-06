from __future__ import annotations

import json
from datetime import datetime, timezone
from urllib.parse import quote

import requests

from playstore_reviews.config import Settings
from playstore_reviews.http_client import (
    ProxyPool,
    browser_headers,
    pause,
    post_with_retries,
)
from playstore_reviews.models import Review
from playstore_reviews.parsing import parse_batchexecute, parse_review_item


def _payload(app_id: str, sort: int, count: int, score: int, device: int, token: str | None) -> str:
    count_block = [count, None, token] if token else [count]
    inner = [
        None,
        [
            2,
            sort,
            count_block,
            None,
            [None, score, None, None, None, None, None, None, device],
        ],
        [app_id, 7],
    ]
    rpc = [[["oCPfdb", json.dumps(inner, separators=(",", ":")), None, "generic"]]]
    return "f.req=" + quote(json.dumps(rpc, separators=(",", ":"))) + "\n"


class BatchexecuteStrategy:
    name = "batchexecute"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.session = requests.Session()
        self.proxies = ProxyPool(settings.proxies)

    def fetch(self, device: str, score: int) -> list[Review]:
        settings = self.settings
        url = (
            "https://play.google.com/_/PlayStoreUi/data/batchexecute"
            f"?hl={settings.lang}&gl={settings.country}"
        )
        remaining = settings.per_query_limit
        token = None
        collected: list[Review] = []
        seen: set[str] = set()

        while remaining > 0:
            page_size = min(settings.page_size, remaining, 150)
            body = _payload(
                settings.app_id,
                settings.sort_code,
                page_size,
                score,
                settings.device_code(device),
                token,
            )
            text = post_with_retries(
                self.session,
                url,
                body,
                browser_headers(settings.lang, settings.country),
                self.proxies.next_mapping(),
                settings.max_retries,
                retry_backoff_seconds=settings.retry_backoff_seconds,
                timeout_seconds=settings.request_timeout_seconds,
            )
            items, token = parse_batchexecute(text)
            if not items:
                break
            added = 0
            for item in items:
                parsed = parse_review_item(item)
                review_score = parsed["score"]
                if review_score is not None and int(review_score) != int(score):
                    continue
                review_id = parsed["review_id"] or ""
                if review_id and review_id in seen:
                    continue
                if review_id:
                    seen.add(review_id)
                collected.append(
                    Review(
                        app_id=settings.app_id,
                        country=settings.country,
                        lang=settings.lang,
                        device=device,
                        score=int(review_score) if review_score is not None else score,
                        review_id=parsed["review_id"],
                        user_name=parsed["user_name"],
                        user_image=parsed["user_image"],
                        content=parsed["content"],
                        review_date=parsed["review_date"],
                        thumbs_up=parsed["thumbs_up"],
                        app_version=parsed["app_version"],
                        developer_reply=parsed["developer_reply"],
                        developer_reply_date=parsed["developer_reply_date"],
                        sort=settings.sort,
                        strategy=self.name,
                        fetched_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    )
                )
                added += 1
                if len(collected) >= settings.per_query_limit:
                    break
            remaining = settings.per_query_limit - len(collected)
            if token is None or added == 0:
                break
            pause(settings.delay_seconds, settings.jitter_seconds)
        return collected
