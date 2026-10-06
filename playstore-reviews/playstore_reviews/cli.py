from __future__ import annotations

import argparse
from pathlib import Path

from playstore_reviews.config import load_settings
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
    return parser


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
    print(
        "Consultando "
        f"{settings.app_id} hl={settings.lang} gl={settings.country} "
        f"dispositivos={','.join(settings.devices)} "
        f"estrellas={','.join(str(s) for s in settings.scores)} "
        f"estrategia={settings.strategy} limite={settings.per_query_limit}"
    )
    result, path = run(settings)
    print(f"Reseñas: {len(result.reviews)}")
    for query in result.queries:
        status = query.error or "ok"
        print(
            f"  {query.device} / {query.score}* / {query.strategy}: "
            f"{query.fetched} ({status})"
        )
    print(f"Excel: {path}")
    return 0
