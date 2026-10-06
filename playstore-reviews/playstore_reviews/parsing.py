from __future__ import annotations

import json
import re
from datetime import datetime, timezone

REVIEW_PAYLOAD = re.compile(r"\)]}'\s*([\s\S]+)")


def nested_lookup(source, indexes):
    current = source
    try:
        for index in indexes:
            current = current[index]
        return current
    except (IndexError, KeyError, TypeError):
        return None


def unix_to_utc(value) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, OSError):
        return None


def parse_review_item(item: list) -> dict:
    return {
        "review_id": nested_lookup(item, [0]),
        "user_name": nested_lookup(item, [1, 0]),
        "user_image": nested_lookup(item, [1, 1, 3, 2]),
        "content": nested_lookup(item, [4]),
        "score": nested_lookup(item, [2]),
        "thumbs_up": nested_lookup(item, [6]),
        "app_version": nested_lookup(item, [10]),
        "review_date": unix_to_utc(nested_lookup(item, [5, 0])),
        "developer_reply": nested_lookup(item, [7, 1]),
        "developer_reply_date": unix_to_utc(nested_lookup(item, [7, 2, 0])),
    }


def extract_token(inner) -> str | None:
    if not isinstance(inner, list):
        return None
    try:
        candidate = inner[-2][-1]
    except (IndexError, TypeError):
        candidate = None
    if isinstance(candidate, str) and candidate:
        return candidate
    for node in reversed(inner[1:]):
        if isinstance(node, str) and len(node) > 8:
            return node
        if isinstance(node, list):
            for value in reversed(node):
                if isinstance(value, str) and len(value) > 8:
                    return value
    return None


def parse_batchexecute(body: str) -> tuple[list, str | None]:
    match = REVIEW_PAYLOAD.search(body)
    if not match:
        raise ValueError("La respuesta no trae el payload de reseñas")
    envelope = json.loads(match.group(1))
    row = envelope[0]
    if isinstance(row, list) and row and isinstance(row[0], list):
        row = row[0]
    raw_inner = row[2]
    if raw_inner is None:
        return [], None
    inner = json.loads(raw_inner) if isinstance(raw_inner, str) else raw_inner
    if not inner or not isinstance(inner, list) or not inner[0]:
        return [], extract_token(inner)
    reviews = inner[0] if isinstance(inner[0], list) else []
    return reviews, extract_token(inner)
