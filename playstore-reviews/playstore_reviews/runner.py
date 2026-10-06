from __future__ import annotations

import logging
from pathlib import Path

from playstore_reviews.config import Settings
from playstore_reviews.export_excel import write_workbook
from playstore_reviews.http_client import pause
from playstore_reviews.manifest import write_manifest
from playstore_reviews.models import QueryResult, Review, ScrapeResult
from playstore_reviews.strategies import build_strategy

logger = logging.getLogger(__name__)


def dedupe_reviews(rows: list[Review], seen: set[tuple[str, str]]) -> list[Review]:
    unique: list[Review] = []
    for row in rows:
        if not row.review_id:
            unique.append(row)
            continue
        key = (row.review_id, row.device)
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def fetch_query(settings: Settings, device: str, score: int, should_stop=None):
    errors: list[str] = []
    names = settings.active_strategies
    for index, name in enumerate(names):
        if should_stop and should_stop():
            return [], name, "detenido"
        strategy = build_strategy(settings, name)
        try:
            rows = strategy.fetch(device, score, should_stop=should_stop)
        except Exception as exc:  # noqa: BLE001 - se reporta y, en auto, se prueba la siguiente
            message = f"{name}: {exc}"
            errors.append(message)
            logger.warning("Fallo %s en %s/%s*: %s", name, device, score, exc)
            continue
        if rows or index == len(names) - 1 or settings.strategy != "auto":
            logger.info("%s/%s* via %s: %s reseñas", device, score, name, len(rows))
            return rows, name, None
        logger.info("%s/%s* via %s no trajo filas; sigue la siguiente estrategia", device, score, name)
    return [], "auto", "; ".join(errors) if errors else None


def run(
    settings: Settings,
    should_stop=None,
    export: bool = True,
) -> tuple[ScrapeResult, Path | None, Path | None]:
    result = ScrapeResult()
    seen: set[tuple[str, str]] = set()
    queries = [(device, score) for device in settings.devices for score in settings.scores]
    logger.info(
        "Inicio %s %s/%s estrategias=%s limite=%s",
        settings.app_id,
        settings.lang,
        settings.country,
        " -> ".join(settings.active_strategies),
        settings.per_query_limit,
    )

    for index, (device, score) in enumerate(queries):
        if should_stop and should_stop():
            result.stopped = True
            logger.info("Corrida detenida antes de %s/%s*", device, score)
            break
        rows, strategy_name, error = fetch_query(settings, device, score, should_stop=should_stop)
        rows = dedupe_reviews(rows, seen)
        result.reviews.extend(rows)
        result.queries.append(
            QueryResult(
                device=device,
                score=score,
                strategy=strategy_name,
                fetched=len(rows),
                error=error,
            )
        )
        if error == "detenido" or (should_stop and should_stop()):
            result.stopped = True
            logger.info("Corrida detenida")
            break
        if index < len(queries) - 1:
            pause(settings.delay_seconds, settings.jitter_seconds, should_stop=should_stop)

    if not export:
        return result, None, None
    excel_path = write_workbook(result, settings)
    manifest_path = write_manifest(result, settings, excel_path) if settings.write_manifest else None
    logger.info("Excel %s (%s reseñas)", excel_path, len(result.reviews))
    return result, excel_path, manifest_path
