import json
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote

from playstore_reviews.config import load_settings, parse_play_url
from playstore_reviews.parsing import parse_batchexecute, parse_review_item
from playstore_reviews.strategies.batchexecute import _payload


def test_parse_play_url_country_from_hl():
    app_id, lang, country = parse_play_url(
        "https://play.google.com/store/apps/details?id=com.rappi.storekeeper&hl=es_CO"
    )
    assert app_id == "com.rappi.storekeeper"
    assert lang == "es"
    assert country == "co"


def test_load_settings_reads_rappi_defaults():
    source = Path(__file__).resolve().parents[1] / "config.yaml"
    settings = load_settings(source)
    assert settings.app_id == "com.rappi.storekeeper"
    assert settings.country == "co"
    assert settings.scores == [1, 2]
    assert settings.devices == ["phone", "tablet"]
    assert settings.strategy == "auto"


def test_payload_includes_score_and_tablet():
    body = _payload("com.example.app", sort=2, count=20, score=1, device=3, token=None)
    decoded = unquote(body)
    assert "oCPfdb" in decoded
    assert "com.example.app" in decoded
    assert "[null,1,null,null,null,null,null,null,3]" in decoded


def test_parse_batchexecute_review_and_token():
    review = [
        "rev-1",
        ["Sergio Mejia", [None, None, None, [None, None, "https://img.example/a.png"]]],
        1,
        None,
        "La verificacion es fastidiosa",
        [1_696_000_000],
        7,
        [None, "Gracias por escribir", [1_696_000_100]],
        None,
        None,
        "8.2.1",
    ]
    inner = [[review], None, [None, "NEXT_TOKEN_VALUE"]]
    envelope = [["wrb.fr", "oCPfdb", json.dumps(inner), None, None]]
    body = ")]}'\n\n" + json.dumps(envelope)
    items, token = parse_batchexecute(body)
    assert token == "NEXT_TOKEN_VALUE"
    parsed = parse_review_item(items[0])
    assert parsed["user_name"] == "Sergio Mejia"
    assert parsed["score"] == 1
    assert parsed["content"].startswith("La verificacion")
    assert parsed["app_version"] == "8.2.1"
    assert parsed["developer_reply"] == "Gracias por escribir"
    assert isinstance(parsed["review_date"], datetime)
