from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from pipelines.atlas_food_sites.source import normalize_source_snapshot


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build the approved browser-safe Milwaukee food-site display snapshot."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--retrieved-at", required=True)
    args = parser.parse_args()

    result = normalize_source_snapshot(
        args.source.read_bytes(),
        retrieved_at=datetime.fromisoformat(args.retrieved_at.replace("Z", "+00:00")),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
