import json
from datetime import datetime
from pathlib import Path

from playstore_reviews.cli import main
from playstore_reviews.config import describe_plan, load_settings
from playstore_reviews.manifest import write_manifest
from playstore_reviews.models import Review, ScrapeResult
from playstore_reviews.runner import dedupe_reviews


def _review(review_id: str, device: str = "phone") -> Review:
    return Review(
        app_id="com.example.app",
        country="co",
        lang="es",
        device=device,
        score=1,
        review_id=review_id,
        user_name="Ana",
        user_image=None,
        content="texto",
        review_date=None,
        thumbs_up=0,
        app_version=None,
        developer_reply=None,
        developer_reply_date=None,
        sort="newest",
        strategy="library",
        fetched_at=datetime(2026, 10, 6),
    )


def test_dedupe_keeps_the_same_review_on_another_device():
    seen: set[tuple[str, str]] = set()
    first = dedupe_reviews([_review("a"), _review("a"), _review("b")], seen)
    second = dedupe_reviews([_review("a"), _review("a", "tablet")], seen)
    assert [row.review_id for row in first] == ["a", "b"]
    assert [(row.review_id, row.device) for row in second] == [("a", "tablet")]


def test_manifest_records_proxy_count_without_the_url(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("PLAYSTORE_PROXIES", "http://user:secret@10.0.0.1:8080")
    config = tmp_path / "config.yaml"
    config.write_text(
        "app_id: com.example.app\ncountry: co\nlang: es\ndevices: [phone]\nscores: [1]\n"
        "output_dir: output\n",
        encoding="utf-8",
    )
    settings = load_settings(config)
    excel = tmp_path / "output" / "reviews.xlsx"
    excel.parent.mkdir()
    excel.write_bytes(b"")
    path = write_manifest(ScrapeResult(), settings, excel)
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["proxy_count"] == 1
    assert "secret" not in path.read_text(encoding="utf-8")
    assert payload["schema"] == 1


def test_dry_run_prints_the_plan_and_skips_the_network(capsys):
    config = Path(__file__).resolve().parents[1] / "config.yaml"
    code = main(["--config", str(config), "--dry-run"])
    captured = capsys.readouterr().out
    assert code == 0
    assert "com.rappi.storekeeper" in captured
    assert "dry-run: no se consultó Play Store" in captured
    assert "phone / 1 estrellas" in captured


def test_describe_plan_lists_every_query():
    settings = load_settings(Path(__file__).resolve().parents[1] / "config.yaml")
    text = describe_plan(settings)
    assert "library -> batchexecute" in text
    assert "tablet / 2 estrellas" in text
