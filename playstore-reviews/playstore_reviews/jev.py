from __future__ import annotations

import os

import requests

DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"
DEFAULT_MODEL = "typesafe/jev-1.13"


def questions_for(problems: list[dict]) -> dict:
    return {
        problem["id"]: {
            "type": "noul",
            "instructions": problem["instructions"],
            "criteria": {"true": problem["true"], "false": problem["false"]},
        }
        for problem in problems
    }


def state_for(review: dict) -> dict:
    return {
        "app_id": review.get("app_id"),
        "country": review.get("country"),
        "device": review.get("device"),
        "stars": review.get("score"),
        "date": review.get("review_date"),
        "comment": review.get("content") or "",
    }


def answers_from_response(payload: dict, problems: list[dict]) -> dict:
    raw_answers = payload.get("answers") or {}
    answers = {}
    for problem in problems:
        node = raw_answers.get(problem["id"]) or {}
        noul = node.get("noul") if isinstance(node, dict) else None
        answers[problem["id"]] = {
            "noul": None if noul is None else float(noul),
            "raw": node,
        }
    return answers


class JevError(RuntimeError):
    pass


class JevClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        url: str = DECISIONS_URL,
        timeout: float = 60,
    ):
        self.api_key = api_key if api_key is not None else os.environ.get("OPENROUTER_API_KEY", "")
        self.model = model
        self.url = url
        self.timeout = timeout

    def classify(self, review: dict, problems: list[dict]) -> dict:
        if not self.api_key:
            raise JevError("Falta OPENROUTER_API_KEY en el entorno")
        body = {
            "model": self.model,
            "state": state_for(review),
            "questions": questions_for(problems),
        }
        response = requests.post(
            self.url,
            json=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=self.timeout,
        )
        if response.status_code >= 400:
            detail = response.text[:500]
            raise JevError(f"Jev respondió HTTP {response.status_code}: {detail}")
        payload = response.json()
        return {
            "answers": answers_from_response(payload, problems),
            "usage": payload.get("usage"),
            "model": payload.get("model") or self.model,
            "raw": payload,
        }
