from __future__ import annotations

import argparse
import logging
from pathlib import Path

from playstore_reviews.config import describe_plan, load_settings
from playstore_reviews.runner import run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Exporta reseñas públicas de Google Play a Excel."
    )
    parser.add_argument(
        "--config",
        default="config.yaml",
        help="Ruta al YAML. Por defecto config.yaml",
    )
    parser.add_argument("--app-id")
    parser.add_argument("--app-url")
    parser.add_argument("--lang")
    parser.add_argument("--country")
    parser.add_argument("--devices", help="Lista separada por comas. Ej: phone,tablet")
    parser.add_argument("--scores", help="Lista separada por comas. Ej: 1,2")
    parser.add_argument("--sort", choices=["newest", "relevant", "rating"])
    parser.add_argument("--limit", type=int, dest="per_query_limit")
    parser.add_argument("--strategy", choices=["library", "batchexecute", "auto"])
    parser.add_argument("--output-dir")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra el plan y no llama a Play Store",
    )
    return parser


def configure_logging(level: str, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    numeric = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(
        level=numeric,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(output_dir / "playstore-reviews.log", encoding="utf-8"),
        ],
    )


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config_path = Path(args.config)
    if not config_path.exists():
        raise SystemExit(f"No existe el archivo de configuración: {config_path}")
    overrides = {
        "app_id": args.app_id,
        "app_url": args.app_url,
        "lang": args.lang,
        "country": args.country,
        "devices": args.devices,
        "scores": args.scores,
        "sort": args.sort,
        "per_query_limit": args.per_query_limit,
        "strategy": args.strategy,
        "output_dir": args.output_dir,
    }
    settings = load_settings(config_path, overrides)
    print(describe_plan(settings))
    if args.dry_run:
        print("dry-run: no se consultó Play Store")
        return 0
    configure_logging(settings.log_level, settings.output_dir)
    result, path, manifest = run(settings)
    print(f"Reseñas: {len(result.reviews)}")
    for query in result.queries:
        status = query.error or "ok"
        print(
            f"  {query.device} / {query.score}* / {query.strategy}: "
            f"{query.fetched} ({status})"
        )
    print(f"Excel: {path}")
    if manifest is not None:
        print(f"Manifiesto: {manifest}")
    return 0
