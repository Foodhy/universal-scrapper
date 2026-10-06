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
NAMED_STRATEGIES = ("library", "batchexecute")

# Claves anidadas que se promueven al mismo Settings.
SECTION_ALIASES = {
    "dir": "output_dir",
    "manifest": "write_manifest",
}
SKIP_KEYS = {"extends", "profile", "query", "consulta", "transport", "output", "name"}


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
    strategy_order: list[str]
    delay_seconds: float
    jitter_seconds: float
    max_retries: int
    retry_backoff_seconds: float
    request_timeout_seconds: float
    proxies: list[str]
    output_dir: Path
    write_manifest: bool
    log_level: str
    source: str
    profile_name: str | None = None

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

    @property
    def active_strategies(self) -> list[str]:
        if self.strategy == "auto":
            return list(self.strategy_order)
        return [self.strategy]


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


def _read_yaml(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle) or {}
    if not isinstance(loaded, dict):
        raise ValueError(f"El archivo {path} no tiene un objeto YAML")
    return loaded


def _merge(base: dict, overlay: dict) -> dict:
    merged = dict(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _resolve_ref(path: Path, ref: str) -> Path:
    candidate = Path(ref)
    if not candidate.is_absolute():
        candidate = path.parent / candidate
    return candidate.resolve()


def _load_raw(path: Path, stack: tuple[Path, ...] = ()) -> dict:
    path = path.resolve()
    if path in stack:
        chain = " -> ".join(str(item) for item in (*stack, path))
        raise ValueError(f"Ciclo en la configuración: {chain}")
    data = _read_yaml(path)
    merged: dict = {}
    for key in ("extends", "profile"):
        ref = data.get(key)
        if not ref:
            continue
        merged = _merge(merged, _load_raw(_resolve_ref(path, str(ref)), (*stack, path)))
    return _merge(merged, data)


def _materialize(data: dict) -> dict:
    flat: dict = {}
    for section in ("query", "consulta", "transport", "output"):
        block = data.get(section) or {}
        if not isinstance(block, dict):
            raise ValueError(f"La sección {section} tiene que ser un objeto")
        for key, value in block.items():
            flat[SECTION_ALIASES.get(key, key)] = value
    for key, value in data.items():
        if key in SKIP_KEYS:
            continue
        flat[SECTION_ALIASES.get(key, key)] = value
    return flat


def describe_plan(settings: Settings) -> str:
    lines = [
        f"app_id: {settings.app_id}",
        f"perfil: {settings.profile_name or settings.source}",
        f"hl/gl: {settings.lang}/{settings.country}",
        f"dispositivos: {', '.join(settings.devices)}",
        f"estrellas: {', '.join(str(score) for score in settings.scores)}",
        f"orden: {settings.sort}",
        f"estrategia: {settings.strategy} ({' -> '.join(settings.active_strategies)})",
        f"limite por consulta: {settings.per_query_limit}",
        f"page_size: {settings.page_size}",
        (
            "ritmo: "
            f"{settings.delay_seconds}s + jitter {settings.jitter_seconds}s, "
            f"reintentos {settings.max_retries}, backoff {settings.retry_backoff_seconds}s"
        ),
        f"proxies: {len(settings.proxies)}",
        f"salida: {settings.output_dir}",
        "consultas:",
    ]
    for device in settings.devices:
        for score in settings.scores:
            lines.append(f"  - {device} / {score} estrellas")
    return "\n".join(lines)


def load_settings(
    config_path: Path | None = None,
    overrides: dict | None = None,
) -> Settings:
    load_dotenv()
    data: dict = {}
    source = "defaults"
    profile_name = None
    if config_path is not None:
        path = Path(config_path)
        data = _materialize(_load_raw(path))
        source = str(path.resolve())
        raw = _read_yaml(path)
        if raw.get("profile"):
            profile_name = str(raw["profile"])
        elif raw.get("name"):
            profile_name = str(raw["name"])

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
    devices = [str(item).strip().lower() for item in devices]
    for device in devices:
        if device not in DEVICES:
            known = ", ".join(sorted(set(DEVICES)))
            raise ValueError(f"Dispositivo desconocido: {device}. Usa uno de: {known}")

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

    order = data.get("strategy_order") or ["library", "batchexecute"]
    if isinstance(order, str):
        order = [item.strip() for item in order.split(",") if item.strip()]
    order = [str(item).strip().lower() for item in order]
    for name in order:
        if name not in NAMED_STRATEGIES:
            raise ValueError(
                f"Estrategia en strategy_order desconocida: {name}. "
                f"Usa: {', '.join(NAMED_STRATEGIES)}"
            )
    if not order:
        raise ValueError("strategy_order no puede estar vacío")

    proxies = data.get("proxies") or []
    if isinstance(proxies, str):
        proxies = _split_proxies(proxies)
    env_proxies = _split_proxies(os.environ.get("PLAYSTORE_PROXIES"))
    if env_proxies:
        proxies = env_proxies

    output_dir = Path(data.get("output_dir") or "output")
    if not output_dir.is_absolute() and config_path is not None:
        base = Path(config_path).resolve().parent
        if base.name == "profiles":
            base = base.parent
        output_dir = base / output_dir

    write_manifest = data.get("write_manifest", True)
    if isinstance(write_manifest, str):
        write_manifest = write_manifest.strip().lower() not in {"0", "false", "no"}

    per_query_limit = int(data.get("per_query_limit") or 20)
    page_size = int(data.get("page_size") or 100)
    if per_query_limit < 1:
        raise ValueError("per_query_limit tiene que ser mayor a 0")
    if page_size < 1:
        raise ValueError("page_size tiene que ser mayor a 0")

    return Settings(
        app_id=str(app_id),
        lang=str(lang).lower(),
        country=str(country).lower(),
        devices=devices,
        scores=scores,
        sort=str(data.get("sort") or "newest"),
        per_query_limit=per_query_limit,
        page_size=min(page_size, 150),
        strategy=strategy,
        strategy_order=order,
        delay_seconds=float(data.get("delay_seconds") if data.get("delay_seconds") is not None else 1.5),
        jitter_seconds=float(data.get("jitter_seconds") if data.get("jitter_seconds") is not None else 0.8),
        max_retries=int(data.get("max_retries") or 4),
        retry_backoff_seconds=float(data.get("retry_backoff_seconds") or 1.5),
        request_timeout_seconds=float(data.get("request_timeout_seconds") or 45),
        proxies=[str(item) for item in proxies],
        output_dir=output_dir,
        write_manifest=bool(write_manifest),
        log_level=str(data.get("log_level") or "info").lower(),
        source=source,
        profile_name=profile_name,
    )
