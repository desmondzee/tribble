#!/usr/bin/env python3
"""
CLI for geolocation pipeline.

Usage:
  cd backend && python scripts/geolocation_cli.py input.json output_events.json output.geojson

Input JSON: array of raw reports with keys: article_text (or text), title, source_url,
  source_name, publish_date, source_language, optional existing_lat/lng, optional media_urls.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Add backend src to path for script execution
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tribble.geolocation import run_pipeline
from tribble.geolocation.serializer import to_geojson


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__, file=sys.stderr)
        return 1

    input_path = Path(sys.argv[1])
    events_path = Path(sys.argv[2])
    geojson_path = Path(sys.argv[3])

    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    with open(input_path) as f:
        reports = json.load(f)

    events = run_pipeline(reports)
    geojson = to_geojson(events)

    events_path.parent.mkdir(parents=True, exist_ok=True)
    geojson_path.parent.mkdir(parents=True, exist_ok=True)

    with open(events_path, "w") as f:
        json.dump([e.model_dump(mode="json") for e in events], f, indent=2)

    with open(geojson_path, "w") as f:
        json.dump(geojson, f, indent=2)

    print(f"Resolved {len(events)} events -> {events_path}")
    print(f"GeoJSON -> {geojson_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
