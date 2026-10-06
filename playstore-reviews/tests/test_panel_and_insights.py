import json
from datetime import datetime
from pathlib import Path

from playstore_reviews.config import load_settings
from playstore_reviews.insights import review_matches, summarize
from playstore_reviews.jev import questions_for
from playstore_reviews.models import Review, review_to_dict
from playstore_reviews.problems import DEFAULT_PROBLEMS, validate_problems
from playstore_reviews.runner import run
from playstore_reviews.server import filtered_reviews, serve


def test_default_catalog_has_eight_distinct_problems():
    problems = validate_problems(DEFAULT_PROBLEMS)
    assert len(problems) == 8
    assert len({problem["id"] for problem in problems}) == 8


def test_jev_questions_are_noul_with_true_and_false():
    payload = questions_for(DEFAULT_PROBLEMS)
    assert set(payload) == {problem["id"] for problem in DEFAULT_PROBLEMS}
    identidad = payload["identidad"]
    assert identidad["type"] == "noul"
    assert "true" in identidad["criteria"]
    assert "false" in identidad["criteria"]


def test_date_filter_includes_the_whole_end_day():
    review = {"review_date": "2026-10-05 23:10:00", "device": "phone", "score": 1, "country": "co", "content": "soporte"}
    assert review_matches(review, date_from="2026-10-05", date_to="2026-10-05")
    assert not review_matches(review, date_from="2026-10-06", date_to="2026-10-06")
    assert review_matches(review, text="Soporte")
    assert not review_matches(review, devices=["tablet"])


def test_insights_count_a_review_in_every_problem_over_the_threshold():
    problems = DEFAULT_PROBLEMS[:2]
    reviews = [
        {"answers": {"identidad": {"noul": 0.91}, "pagos": {"noul": 0.2}}},
        {"answers": {"identidad": {"noul": 0.5}, "pagos": {"noul": 0.95}}},
        {"content": "todavía sin clasificar"},
    ]
    summary = summarize(reviews, problems, 0.8)
    assert summary["classified"] == 2
    assert summary["unmatched"] == 0
    counts = {item["id"]: item["count"] for item in summary["problems"]}
    assert counts["identidad"] == 1
    assert counts["pagos"] == 1


def test_run_stops_before_the_second_query(tmp_path: Path, monkeypatch):
    config = tmp_path / "config.yaml"
    config.write_text(
        "app_id: com.example.app\ncountry: co\nlang: es\ndevices: [phone, tablet]\n"
        "scores: [1]\noutput_dir: output\nwrite_manifest: false\n",
        encoding="utf-8",
    )
    settings = load_settings(config)
    calls = []

    def fake_fetch(settings, device, score, should_stop=None):
        calls.append(device)
        review = Review(
            app_id="com.example.app",
            country="co",
            lang="es",
            device=device,
            score=1,
            review_id="r1",
            user_name="Ana",
            user_image=None,
            content="texto",
            review_date=datetime(2026, 10, 5, 12, 0, 0),
            thumbs_up=0,
            app_version=None,
            developer_reply=None,
            developer_reply_date=None,
            sort="newest",
            strategy="library",
            fetched_at=datetime(2026, 10, 6),
        )
        return [review], "library", None

    monkeypatch.setattr("playstore_reviews.runner.fetch_query", fake_fetch)
    result, excel, _manifest = run(settings, should_stop=lambda: len(calls) >= 1)
    assert calls == ["phone"]
    assert result.stopped is True
    assert len(result.reviews) == 1
    assert excel is not None
    assert review_to_dict(result.reviews[0])["review_date"] == "2026-10-05 12:00:00"


def test_panel_serves_defaults_and_filters(tmp_path: Path):
    server = serve(tmp_path, "127.0.0.1", 0)
    thread_started = __import__("threading").Thread(target=server.serve_forever, daemon=True)
    thread_started.start()
    port = server.server_address[1]
    try:
        import urllib.request

        with urllib.request.urlopen(f"http://127.0.0.1:{port}/") as response:
            html = response.read().decode("utf-8")
        assert "Clasificar con Jev" in html
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/defaults") as response:
            defaults = json.loads(response.read().decode("utf-8"))
        assert defaults["app_id"] == "com.rappi.storekeeper"
        assert len(defaults["problems"]) == 8
        (tmp_path / "output").mkdir(exist_ok=True)
        (tmp_path / "output" / "latest-reviews.json").write_text(
            json.dumps(
                {
                    "reviews": [
                        {"review_date": "2026-10-01 10:00:00", "country": "co", "content": "deuda", "device": "phone", "score": 1},
                        {"review_date": "2026-09-01 10:00:00", "country": "mx", "content": "hola", "device": "tablet", "score": 2},
                    ]
                }
            ),
            encoding="utf-8",
        )
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/reviews?from=2026-10-01&to=2026-10-02") as response:
            body = json.loads(response.read().decode("utf-8"))
        assert len(body["reviews"]) == 1
        assert body["reviews"][0]["content"] == "deuda"
        assert filtered_reviews({"reviews": body["reviews"]}, {})[0]["country"] == "co"
    finally:
        server.shutdown()
