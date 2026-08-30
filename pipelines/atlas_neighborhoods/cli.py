"""Closed command boundary for neighborhood fetch and development load."""

from __future__ import annotations

import argparse
from pathlib import Path

from .database import (
    PsycopgNeighborhoodRepository,
    build_persistence_plan,
    require_development_environment,
)
from .source import fetch_neighborhood_snapshot


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="atlas_neighborhoods")
    parser.add_argument("command", choices=("fetch", "run"))
    parser.add_argument("--root", type=Path, default=Path("."))
    args = parser.parse_args(argv)
    snapshot = fetch_neighborhood_snapshot(args.root)
    if args.command == "run":
        database_url = require_development_environment()
        plan = build_persistence_plan(snapshot)
        PsycopgNeighborhoodRepository(database_url).execute(plan)
        print(
            f"loaded {len(snapshot.records)} neighborhoods; "
            f"snapshot_id={plan.snapshot_id}"
        )
        return 0
    print(
        f"fetched {len(snapshot.records)} neighborhoods; "
        f"checksum={snapshot.snapshot.manifest.checksum_sha256}"
    )
    return 0
