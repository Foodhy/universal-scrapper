from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Review:
    app_id: str
    country: str
    lang: str
    device: str
    score: int | None
    review_id: str | None
    user_name: str | None
    user_image: str | None
    content: str | None
    review_date: datetime | None
    thumbs_up: int | None
    app_version: str | None
    developer_reply: str | None
    developer_reply_date: datetime | None
    sort: str
    strategy: str
    fetched_at: datetime

    @property
    def review_url(self) -> str | None:
        if not self.review_id:
            return None
        return (
            "https://play.google.com/store/apps/details"
            f"?id={self.app_id}&reviewId={self.review_id}"
        )


@dataclass
class QueryResult:
    device: str
    score: int
    strategy: str
    fetched: int
    error: str | None = None


@dataclass
class ScrapeResult:
    reviews: list[Review] = field(default_factory=list)
    queries: list[QueryResult] = field(default_factory=list)
    stopped: bool = False


def _stamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%d %H:%M:%S")


def review_to_dict(review: Review) -> dict:
    return {
        "app_id": review.app_id,
        "country": review.country,
        "lang": review.lang,
        "device": review.device,
        "score": review.score,
        "review_id": review.review_id,
        "user_name": review.user_name,
        "user_image": review.user_image,
        "content": review.content,
        "review_date": _stamp(review.review_date),
        "thumbs_up": review.thumbs_up,
        "app_version": review.app_version,
        "developer_reply": review.developer_reply,
        "developer_reply_date": _stamp(review.developer_reply_date),
        "sort": review.sort,
        "strategy": review.strategy,
        "fetched_at": _stamp(review.fetched_at),
        "review_url": review.review_url,
    }
