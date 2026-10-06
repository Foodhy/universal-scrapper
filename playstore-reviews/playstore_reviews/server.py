from __future__ import annotations

import json
import logging
import threading
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yaml

from playstore_reviews.classification_export import write_classification_excel
from playstore_reviews.config import load_settings
from playstore_reviews.export_excel import write_workbook
from playstore_reviews.insights import review_matches, summarize
from playstore_reviews.jev import DEFAULT_MODEL, JevClient, JevError
from playstore_reviews.manifest import write_manifest
from playstore_reviews.models import ScrapeResult, review_to_dict
from playstore_reviews.problems import DEFAULT_PROBLEMS, validate_problems
from playstore_reviews.runner import dedupe_reviews, run

logger = logging.getLogger(__name__)
PANEL_FILE = Path(__file__).resolve().parent / "panel" / "index.html"
COUNTRY_CHOICES = ["co", "mx", "ar", "cl", "pe", "ec", "br", "uy", "cr", "pa", "us"]


class Studio:
    def __init__(self, root: Path):
        self.root = root
        self.output = root / "output"
        self.output.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.kind = None
        self.status = "idle"
        self.error = None
        self.logs: list[str] = []
        self.progress = {"done": 0, "total": 0}
        self.excel = None
        self.classification_excel = None

    def log(self, message: str) -> None:
        with self.lock:
            self.logs.append(message)
            del self.logs[:-200]

    def snapshot(self) -> dict:
        reviews = _read_json(self.output / "latest-reviews.json") or {}
        classification = _read_json(self.output / "latest-classification.json") or {}
        with self.lock:
            return {
                "status": self.status,
                "kind": self.kind,
                "error": self.error,
                "logs": list(self.logs),
                "progress": dict(self.progress),
                "excel": self.excel,
                "classification_excel": self.classification_excel,
                "review_count": len(reviews.get("reviews") or []),
                "stopped": bool(reviews.get("stopped")),
                "classified": sum(1 for review in classification.get("reviews") or [] if review.get("answers")),
                "model": classification.get("model") or DEFAULT_MODEL,
                "threshold": classification.get("threshold", 0.8),
            }

    def start_scrape(self, payload: dict) -> None:
        self._start("scrape", self._scrape, payload)

    def start_classify(self, payload: dict) -> None:
        self._start("classify", self._classify, payload)

    def stop(self) -> None:
        self.stop_event.set()
        self.log("Parada pedida")

    def _start(self, kind: str, target, payload: dict) -> None:
        with self.lock:
            if self.thread and self.thread.is_alive():
                raise RuntimeError("Ya hay una corrida en curso")
            self.stop_event.clear()
            self.kind = kind
            self.status = "running"
            self.error = None
            self.logs = []
            self.progress = {"done": 0, "total": 0}
            self.thread = threading.Thread(target=target, args=(payload,), daemon=True)
            self.thread.start()

    def _scrape(self, payload: dict) -> None:
        handler = _LogCapture(self)
        logging.getLogger("playstore_reviews").addHandler(handler)
        try:
            countries = _countries(payload.get("countries"))
            devices = payload.get("devices") or ["phone"]
            scores = payload.get("scores") or [1, 2]
            total = len(countries) * len(devices) * len(scores)
            with self.lock:
                self.progress = {"done": 0, "total": total}
            merged = ScrapeResult()
            seen: set[tuple[str, str]] = set()
            settings = None
            finished_queries = 0
            for country in countries:
                if self.stop_event.is_set():
                    merged.stopped = True
                    break
                settings = settings_for(payload, country, self.root)
                self.log(f"Consultando {settings.app_id} en {country}")
                result, _, _ = run(settings, should_stop=self.stop_event.is_set, export=False)
                merged.reviews.extend(dedupe_reviews(result.reviews, seen))
                merged.queries.extend(result.queries)
                finished_queries += len(result.queries)
                with self.lock:
                    self.progress = {"done": finished_queries, "total": total}
                if result.stopped:
                    merged.stopped = True
                    break
            if settings is None:
                raise RuntimeError("Selecciona al menos un país")
            excel_path = write_workbook(merged, settings)
            manifest_path = write_manifest(merged, settings, excel_path)
            _write_json(
                self.output / "latest-reviews.json",
                {
                    "stopped": merged.stopped,
                    "excel": excel_path.name,
                    "manifest": manifest_path.name,
                    "queries": [asdict(query) for query in merged.queries],
                    "reviews": [review_to_dict(review) for review in merged.reviews],
                },
            )
            with self.lock:
                self.excel = excel_path.name
                self.status = "stopped" if merged.stopped else "done"
            self.log(f"Listo: {len(merged.reviews)} reseñas en {excel_path.name}")
        except Exception as exc:  # noqa: BLE001 - el panel muestra el error y sigue vivo
            logger.exception("Fallo la exploración")
            with self.lock:
                self.status = "error"
                self.error = str(exc)
            self.log(str(exc))
        finally:
            logging.getLogger("playstore_reviews").removeHandler(handler)

    def _classify(self, payload: dict) -> None:
        try:
            source = _read_json(self.output / "latest-reviews.json") or {}
            reviews = list(source.get("reviews") or [])
            if not reviews:
                raise RuntimeError("No hay reseñas todavía. Primero explora.")
            problems = validate_problems(payload.get("problems") or load_problems(self.output))
            _write_json(self.output / "problems.json", problems)
            threshold = float(payload.get("threshold", 0.8))
            if not 0 < threshold <= 1:
                raise ValueError("El umbral tiene que estar entre 0 y 1")
            model = str(payload.get("model") or DEFAULT_MODEL)
            force = bool(payload.get("force"))
            previous = _read_json(self.output / "latest-classification.json") or {}
            cached = {}
            if not force:
                for review in previous.get("reviews") or []:
                    if review.get("answers") and review.get("review_id"):
                        cached[review["review_id"]] = review
            pending = [review for review in reviews if force or review.get("review_id") not in cached]
            with self.lock:
                self.progress = {"done": 0, "total": len(pending)}
            client = JevClient(model=model)
            for index, review in enumerate(pending, start=1):
                if self.stop_event.is_set():
                    self.log("Clasificación detenida")
                    break
                self.log(f"Jev {index}/{len(pending)} {review.get('user_name') or review.get('review_id')}")
                try:
                    decision = client.classify(review, problems)
                except JevError:
                    self._persist_classification(reviews, cached, problems, model, threshold)
                    raise
                cached[review.get("review_id")] = {
                    "answers": decision["answers"],
                    "usage": decision["usage"],
                    "model": decision["model"],
                    "raw": decision["raw"],
                }
                with self.lock:
                    self.progress = {"done": index, "total": len(pending)}
            excel_name, classified_count = self._persist_classification(
                reviews, cached, problems, model, threshold
            )
            with self.lock:
                self.classification_excel = excel_name
                self.status = "stopped" if self.stop_event.is_set() else "done"
            self.log(f"Clasificadas {classified_count} reseñas")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Fallo la clasificación")
            with self.lock:
                self.status = "error"
                self.error = str(exc)
            self.log(str(exc))

    def _persist_classification(self, reviews, cached, problems, model, threshold):
        rows = []
        for review in reviews:
            extra = cached.get(review.get("review_id")) or {}
            rows.append({**review, **extra})
        classified_rows = [row for row in rows if row.get("answers")]
        excel_path = None
        if classified_rows:
            excel_path = write_classification_excel(classified_rows, problems, threshold, self.output)
        _write_json(
            self.output / "latest-classification.json",
            {
                "model": model,
                "threshold": threshold,
                "problems": problems,
                "stopped": self.stop_event.is_set(),
                "excel": excel_path.name if excel_path else None,
                "reviews": rows,
            },
        )
        return (excel_path.name if excel_path else None), len(classified_rows)


class _LogCapture(logging.Handler):
    def __init__(self, studio: Studio):
        super().__init__(level=logging.INFO)
        self.studio = studio

    def emit(self, record: logging.LogRecord) -> None:
        self.studio.log(record.getMessage())


def settings_for(payload: dict, country: str, root: Path):
    data = {
        "app_id": payload.get("app_id") or None,
        "app_url": payload.get("app_url") or None,
        "lang": payload.get("lang") or "es",
        "country": country,
        "devices": payload.get("devices") or ["phone", "tablet"],
        "scores": payload.get("scores") or [1, 2],
        "sort": payload.get("sort") or "newest",
        "per_query_limit": int(payload.get("per_query_limit") or 20),
        "page_size": int(payload.get("page_size") or 100),
        "strategy": payload.get("strategy") or "auto",
        "strategy_order": payload.get("strategy_order") or ["library", "batchexecute"],
        "delay_seconds": float(payload.get("delay_seconds") if payload.get("delay_seconds") not in (None, "") else 1.5),
        "jitter_seconds": float(payload.get("jitter_seconds") if payload.get("jitter_seconds") not in (None, "") else 0.8),
        "max_retries": int(payload.get("max_retries") or 4),
        "retry_backoff_seconds": float(payload.get("retry_backoff_seconds") or 1.5),
        "request_timeout_seconds": float(payload.get("request_timeout_seconds") or 45),
        "output_dir": str((root / "output").resolve()),
        "write_manifest": True,
        "log_level": "info",
    }
    path = root / "output" / ".panel-job.yaml"
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return load_settings(path)


def load_problems(output: Path) -> list[dict]:
    saved = _read_json(output / "problems.json")
    if isinstance(saved, list) and saved:
        return validate_problems(saved)
    return validate_problems(DEFAULT_PROBLEMS)


def _countries(value) -> list[str]:
    if isinstance(value, str):
        value = [item.strip() for item in value.split(",") if item.strip()]
    countries = [str(item).strip().lower() for item in (value or [])]
    if not countries:
        raise ValueError("Selecciona al menos un país")
    return countries


def _read_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def filtered_reviews(payload: dict, params: dict) -> list[dict]:
    devices = [item for item in (params.get("devices") or "").split(",") if item]
    scores = [int(item) for item in (params.get("scores") or "").split(",") if item]
    countries = [item for item in (params.get("countries") or "").split(",") if item]
    reviews = []
    for review in payload.get("reviews") or []:
        if review_matches(
            review,
            date_from=params.get("from") or None,
            date_to=params.get("to") or None,
            devices=devices or None,
            scores=scores or None,
            countries=countries or None,
            text=params.get("q") or None,
        ):
            reviews.append(review)
    return reviews


def build_handler(studio: Studio):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            parsed = urlparse(self.path)
            path = parsed.path
            params = {key: values[0] for key, values in parse_qs(parsed.query).items()}
            if path == "/":
                self._bytes(200, PANEL_FILE.read_bytes(), "text/html; charset=utf-8")
                return
            if path == "/api/defaults":
                self._json(200, _defaults(studio))
                return
            if path == "/api/state":
                self._json(200, studio.snapshot())
                return
            if path == "/api/reviews":
                payload = _read_json(studio.output / "latest-reviews.json") or {"reviews": [], "queries": []}
                reviews = filtered_reviews(payload, params)
                self._json(200, {"reviews": reviews, "queries": payload.get("queries") or [], "stopped": payload.get("stopped")})
                return
            if path == "/api/classification":
                payload = _read_json(studio.output / "latest-classification.json") or {"reviews": [], "problems": load_problems(studio.output)}
                reviews = filtered_reviews(payload, params)
                threshold = float(params.get("threshold") or payload.get("threshold") or 0.8)
                slim = []
                for review in reviews:
                    slim.append(
                        {
                            "review_id": review.get("review_id"),
                            "review_date": review.get("review_date"),
                            "country": review.get("country"),
                            "device": review.get("device"),
                            "score": review.get("score"),
                            "user_name": review.get("user_name"),
                            "content": review.get("content"),
                            "app_version": review.get("app_version"),
                            "answers": {
                                key: {"noul": value.get("noul")}
                                for key, value in (review.get("answers") or {}).items()
                            },
                        }
                    )
                self._json(
                    200,
                    {
                        "model": payload.get("model"),
                        "threshold": payload.get("threshold", 0.8),
                        "problems": payload.get("problems") or load_problems(studio.output),
                        "insights": summarize(slim, payload.get("problems") or load_problems(studio.output), threshold),
                        "reviews": slim,
                        "excel": payload.get("excel"),
                    },
                )
                return
            if path == "/api/classification/raw":
                target = studio.output / "latest-classification.json"
                if not target.exists():
                    self._json(404, {"error": "Todavía no hay clasificación"})
                    return
                self._bytes(200, target.read_bytes(), "application/json; charset=utf-8")
                return
            if path == "/api/file":
                self._send_output_file(params.get("name") or "")
                return
            self._json(404, {"error": "No existe"})

        def do_POST(self):  # noqa: N802
            path = urlparse(self.path).path
            try:
                payload = self._read_body()
                if path == "/api/scrape":
                    studio.start_scrape(payload)
                    self._json(202, {"ok": True})
                    return
                if path == "/api/classify":
                    studio.start_classify(payload)
                    self._json(202, {"ok": True})
                    return
                if path == "/api/stop":
                    studio.stop()
                    self._json(200, {"ok": True})
                    return
            except RuntimeError as exc:
                self._json(409, {"error": str(exc)})
                return
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
                return
            self._json(404, {"error": "No existe"})

        def _read_body(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            if length == 0:
                return {}
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("El cuerpo tiene que ser un objeto JSON")
            return data

        def _send_output_file(self, name: str) -> None:
            candidate = (studio.output / Path(name).name).resolve()
            if candidate.parent != studio.output.resolve() or not candidate.is_file():
                self._json(404, {"error": "Archivo no encontrado"})
                return
            kind = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            if candidate.suffix == ".json":
                kind = "application/json; charset=utf-8"
            self._bytes(200, candidate.read_bytes(), kind, download=candidate.name)

        def _json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self._bytes(status, body, "application/json; charset=utf-8")

        def _bytes(self, status: int, body: bytes, content_type: str, download: str | None = None) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            if download:
                self.send_header("Content-Disposition", f'attachment; filename="{download}"')
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt: str, *args) -> None:
            logger.info("panel %s", fmt % args)

    return Handler


def _defaults(studio: Studio) -> dict:
    import os

    return {
        "app_id": "com.rappi.storekeeper",
        "app_url": "https://play.google.com/store/apps/details?id=com.rappi.storekeeper&hl=es_CO",
        "lang": "es",
        "countries": ["co"],
        "country_choices": COUNTRY_CHOICES,
        "devices": ["phone", "tablet"],
        "scores": [1, 2],
        "sort": "newest",
        "per_query_limit": 20,
        "page_size": 100,
        "strategy": "auto",
        "strategy_order": ["library", "batchexecute"],
        "delay_seconds": 1.5,
        "jitter_seconds": 0.8,
        "max_retries": 4,
        "problems": load_problems(studio.output),
        "model": DEFAULT_MODEL,
        "threshold": 0.8,
        "jev_configured": bool(os.environ.get("OPENROUTER_API_KEY")),
    }


def serve(root: Path, host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    studio = Studio(root)
    server = ThreadingHTTPServer((host, port), build_handler(studio))
    server.studio = studio  # type: ignore[attr-defined]
    return server


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Panel local para explorar reseñas y clasificarlas con Jev.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--root", default=".")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    root = Path(args.root).resolve()
    server = serve(root, args.host, args.port)
    print(f"Panel en http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Panel detenido")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
