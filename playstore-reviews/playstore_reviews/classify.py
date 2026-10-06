from __future__ import annotations

import argparse
import json
from pathlib import Path

from playstore_reviews.classification_export import write_classification_excel
from playstore_reviews.jev import DEFAULT_MODEL, JevClient
from playstore_reviews.problems import DEFAULT_PROBLEMS, validate_problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Clasifica reseñas ya exportadas con Jev.")
    parser.add_argument("--input", default="output/latest-reviews.json")
    parser.add_argument("--problems", default="output/problems.json")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--threshold", type=float, default=0.8)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--limit", type=int, default=0, help="0 clasifica todas")
    args = parser.parse_args(argv)

    source_path = Path(args.input)
    payload = json.loads(source_path.read_text(encoding="utf-8"))
    reviews = list(payload.get("reviews") or [])
    if args.limit:
        reviews = reviews[: args.limit]
    problems_path = Path(args.problems)
    if problems_path.exists():
        problems = validate_problems(json.loads(problems_path.read_text(encoding="utf-8")))
    else:
        problems = validate_problems(DEFAULT_PROBLEMS)
    client = JevClient(model=args.model)
    rows = []
    for index, review in enumerate(reviews, start=1):
        print(f"{index}/{len(reviews)} {review.get('user_name') or review.get('review_id')}")
        decision = client.classify(review, problems)
        rows.append(
            {
                **review,
                "answers": decision["answers"],
                "usage": decision["usage"],
                "model": decision["model"],
                "raw": decision["raw"],
            }
        )
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    excel = write_classification_excel(rows, problems, args.threshold, output_dir)
    destination = output_dir / "latest-classification.json"
    destination.write_text(
        json.dumps(
            {
                "model": args.model,
                "threshold": args.threshold,
                "problems": problems,
                "excel": excel.name,
                "reviews": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Excel: {excel}")
    print(f"JSON: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
