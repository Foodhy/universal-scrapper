from __future__ import annotations

from datetime import datetime, timedelta


def parse_moment(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("T", " ").replace("Z", "")
    if len(text) == 10:
        return datetime.fromisoformat(text)
    return datetime.fromisoformat(text[:19])


def end_bound(value: str | None) -> datetime | None:
    moment = parse_moment(value)
    if moment is None or value is None:
        return None
    if len(str(value).strip()) == 10:
        return moment + timedelta(days=1) - timedelta(microseconds=1)
    return moment


def review_matches(
    review: dict,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    devices: list[str] | None = None,
    scores: list[int] | None = None,
    countries: list[str] | None = None,
    text: str | None = None,
) -> bool:
    moment = parse_moment(review.get("review_date"))
    start = parse_moment(date_from)
    finish = end_bound(date_to)
    if start and (moment is None or moment < start):
        return False
    if finish and (moment is None or moment > finish):
        return False
    if devices and review.get("device") not in devices:
        return False
    if scores and int(review.get("score") or 0) not in scores:
        return False
    if countries and str(review.get("country") or "").lower() not in {item.lower() for item in countries}:
        return False
    if text:
        blob = f"{review.get('content') or ''} {review.get('user_name') or ''}".lower()
        if text.lower() not in blob:
            return False
    return True


def apply_threshold(answers: dict, threshold: float) -> dict:
    scored = {}
    for problem_id, node in answers.items():
        noul = node.get("noul") if isinstance(node, dict) else None
        probability = None if noul is None else float(noul)
        scored[problem_id] = {
            "noul": probability,
            "matched": probability is not None and probability >= threshold,
        }
    return scored


def summarize(reviews: list[dict], problems: list[dict], threshold: float) -> dict:
    counts = {problem["id"]: 0 for problem in problems}
    unmatched = 0
    classified = 0
    for review in reviews:
        answers = review.get("answers")
        if not answers:
            continue
        classified += 1
        scored = apply_threshold(answers, threshold)
        matched = [problem_id for problem_id, node in scored.items() if node["matched"]]
        if not matched:
            unmatched += 1
        for problem_id in matched:
            if problem_id in counts:
                counts[problem_id] += 1
    ranking = []
    for problem in problems:
        problem_id = problem["id"]
        count = counts.get(problem_id, 0)
        ranking.append(
            {
                "id": problem_id,
                "title": problem["title"],
                "count": count,
                "share": (count / classified) if classified else 0,
            }
        )
    ranking.sort(key=lambda item: (-item["count"], item["title"]))
    return {
        "reviews": len(reviews),
        "classified": classified,
        "unmatched": unmatched,
        "threshold": threshold,
        "problems": ranking,
    }
