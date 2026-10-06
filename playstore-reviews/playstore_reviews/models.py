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
