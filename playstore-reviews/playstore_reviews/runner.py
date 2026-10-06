from __future__ import annotations

from pathlib import Path

from playstore_reviews.config import Settings
from playstore_reviews.export_excel import write_workbook
from playstore_reviews.http_client import pause
from playstore_reviews.models import QueryResult, ScrapeResult
from playstore_reviews.strategies import build_strategy


def _fetch_auto(settings: Settings, device: str, score: int):
    from playstore_reviews.strategies.batchexecute import BatchexecuteStrategy
    from playstore_reviews.strategies.library import LibraryStrategy

    errors: list[str] = []
    for strategy in (LibraryStrategy(settings), BatchexecuteStrategy(settings)):
        try:
            rows = strategy.fetch(device, score)
        except Exception as exc:  # noqa: BLE001 - se reporta en el Excel y se intenta la otra vía
            errors.append(f"{strategy.name}: {exc}")
            continue
        if rows:
            return rows, strategy.name, None
    if errors:
        return [], "auto", "; ".join(errors)
    return [], "auto", None


def run(settings: Settings) -> tuple[ScrapeResult, Path]:
    result = ScrapeResult()
    single = build_strategy(settings)
    queries = [(device, score) for device in settings.devices for score in settings.scores]

    for index, (device, score) in enumerate(queries):
        settings.device_code(device)
        try:
            if single is None:
                rows, strategy_name, error = _fetch_auto(settings, device, score)
            else:
                rows = single.fetch(device, score)
                strategy_name = single.name
                error = None
        except Exception as exc:  # noqa: BLE001 - una consulta fallida no corta el resto
            rows = []
            strategy_name = settings.strategy
            error = str(exc)
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
        if index < len(queries) - 1:
            pause(settings.delay_seconds, settings.jitter_seconds)

    path = write_workbook(result, settings)
    return result, path
