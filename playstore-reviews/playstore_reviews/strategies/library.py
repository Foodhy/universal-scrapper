from __future__ import annotations

import os
from datetime import datetime, timezone

from google_play_scraper import Sort, reviews

from playstore_reviews.config import DEVICES, Settings
from playstore_reviews.http_client import ProxyPool
from playstore_reviews.models import Review

SORT_ENUM = {
    1: Sort.MOST_RELEVANT,
    2: Sort.NEWEST,
    3: Sort.RATING,
}


class LibraryStrategy:
    name = "library"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.proxies = ProxyPool(settings.proxies)

    def fetch(self, device: str, score: int, should_stop=None) -> list[Review]:
        if should_stop and should_stop():
            return []
        settings = self.settings
        mapping = self.proxies.next_mapping()
        previous = {
            "HTTP_PROXY": os.environ.get("HTTP_PROXY"),
            "HTTPS_PROXY": os.environ.get("HTTPS_PROXY"),
        }
        if mapping:
            os.environ["HTTP_PROXY"] = mapping["http"]
            os.environ["HTTPS_PROXY"] = mapping["https"]
        try:
            batch, _token = reviews(
                settings.app_id,
                lang=settings.lang,
                country=settings.country,
                sort=SORT_ENUM[settings.sort_code],
                count=settings.per_query_limit,
                filter_score_with=score,
                filter_device_with=DEVICES[device.strip().lower()],
            )
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        fetched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        rows: list[Review] = []
        for item in batch:
            item_score = item.get("score")
            if item_score is not None and int(item_score) != int(score):
                continue
            review_date = item.get("at")
            reply_date = item.get("repliedAt")
            if hasattr(review_date, "tzinfo") and review_date is not None and review_date.tzinfo:
                review_date = review_date.astimezone(timezone.utc).replace(tzinfo=None)
            if hasattr(reply_date, "tzinfo") and reply_date is not None and reply_date.tzinfo:
                reply_date = reply_date.astimezone(timezone.utc).replace(tzinfo=None)
            rows.append(
                Review(
                    app_id=settings.app_id,
                    country=settings.country,
                    lang=settings.lang,
                    device=device,
                    score=int(item_score) if item_score is not None else score,
                    review_id=item.get("reviewId"),
                    user_name=item.get("userName"),
                    user_image=item.get("userImage"),
                    content=item.get("content"),
                    review_date=review_date,
                    thumbs_up=item.get("thumbsUpCount"),
                    app_version=item.get("appVersion") or item.get("reviewCreatedVersion"),
                    developer_reply=item.get("replyContent"),
                    developer_reply_date=reply_date,
                    sort=settings.sort,
                    strategy=self.name,
                    fetched_at=fetched_at,
                )
            )
        return rows
