from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yaml
from dotenv import load_dotenv

DEVICES = {
    "phone": 2,
    "telefono": 2,
    "teléfono": 2,
    "mobile": 2,
    "tablet": 3,
    "chromebook": 5,
    "tv": 6,
}

SORTS = {
    "relevant": 1,
    "relevantes": 1,
    "newest": 2,
    "nuevas": 2,
    "rating": 3,
    "calificacion": 3,
    "calificación": 3,
}

STRATEGIES = ("library", "batchexecute", "auto")


@dataclass
class Settings:
    app_id: str
    lang: str
    country: str
    devices: list[str]
    scores: list[int]
    sort: str
    per_query_limit: int
    page_size: int
    strategy: str
    delay_seconds: float
    jitter_seconds: float
    max_retries: int
    proxies: list[str]
    output_dir: Path
    source: str

    def device_code(self, name: str) -> int:
        key = name.strip().lower()
        if key not in DEVICES:
            known = ", ".join(sorted(set(DEVICES)))
            raise ValueError(f"Dispositivo desconocido: {name}. Usa uno de: {known}")
        return DEVICES[key]

    @property
    def sort_code(self) -> int:
        key = self.sort.strip().lower()
        if key not in SORTS:
            known = ", ".join(sorted({k for k in SORTS if k.isascii()}))
            raise ValueError(f"Orden desconocido: {self.sort}. Usa uno de: {known}")
        return SORTS[key]


def parse_play_url(url: str) -> tuple[str | None, str | None, str | None]:
    """Devuelve app_id, lang, country a partir de un enlace de Play Store."""
    parsed = urlparse(url.strip())
    query = parse_qs(parsed.query)
    app_id = (query.get("id") or [None])[0]
    lang = None
    country = None
    hl = (query.get("hl") or [None])[0]
    gl = (query.get("gl") or [None])[0]
    if hl:
        if "_" in hl:
            lang_part, country_part = hl.split("_", 1)
            lang = lang_part.lower()
            country = country_part.lower()
        elif "-" in hl:
            lang_part, country_part = hl.split("-", 1)
            lang = lang_part.lower()
            country = country_part.lower()
        else:
            lang = hl.lower()
    if gl:
        country = gl.lower()
    return app_id, lang, country


def _split_proxies(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def load_settings(
    config_path: Path | None = None,
    overrides: dict | None = None,
) -> Settings:
    load_dotenv()
    data: dict = {}
    source = "defaults"
    if config_path is not None:
        path = Path(config_path)
        with path.open(encoding="utf-8") as handle:
            loaded = yaml.safe_load(handle) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"El archivo {path} no tiene un objeto YAML")
        data.update(loaded)
        source = str(path)

    if overrides:
        for key, value in overrides.items():
            if value is not None:
                data[key] = value

    app_url = data.get("app_url") or data.get("url")
    app_id = data.get("app_id")
    lang = data.get("lang") or "es"
    country = data.get("country") or "co"
    if app_url:
        parsed_id, parsed_lang, parsed_country = parse_play_url(str(app_url))
        app_id = app_id or parsed_id
        if parsed_lang and "lang" not in data:
            lang = parsed_lang
        if parsed_country and "country" not in data:
            country = parsed_country
    if not app_id:
        raise ValueError("Falta app_id o un app_url con ?id=")

    devices = data.get("devices") or ["phone"]
    if isinstance(devices, str):
        devices = [item.strip() for item in devices.split(",") if item.strip()]

    scores = data.get("scores") or [1, 2]
    if isinstance(scores, str):
        scores = [int(item.strip()) for item in scores.split(",") if item.strip()]
    scores = [int(score) for score in scores]
    for score in scores:
        if score < 1 or score > 5:
            raise ValueError(f"Estrellas fuera de rango: {score}")

    strategy = str(data.get("strategy") or "auto").lower()
    if strategy not in STRATEGIES:
        raise ValueError(f"Estrategia desconocida: {strategy}. Usa: {', '.join(STRATEGIES)}")

    proxies = data.get("proxies") or []
    if isinstance(proxies, str):
        proxies = _split_proxies(proxies)
    env_proxies = _split_proxies(os.environ.get("PLAYSTORE_PROXIES"))
    if env_proxies:
        proxies = env_proxies

    output_dir = Path(data.get("output_dir") or "output")
    if not output_dir.is_absolute() and config_path is not None:
        output_dir = Path(config_path).resolve().parent / output_dir

    return Settings(
        app_id=str(app_id),
        lang=str(lang).lower(),
        country=str(country).lower(),
        devices=[str(item) for item in devices],
        scores=scores,
        sort=str(data.get("sort") or "newest"),
        per_query_limit=int(data.get("per_query_limit") or 20),
        page_size=int(data.get("page_size") or 20),
        strategy=strategy,
        delay_seconds=float(data.get("delay_seconds") or 1.5),
        jitter_seconds=float(data.get("jitter_seconds") or 0.8),
        max_retries=int(data.get("max_retries") or 3),
        proxies=[str(item) for item in proxies],
        output_dir=output_dir,
        source=source,
    )
