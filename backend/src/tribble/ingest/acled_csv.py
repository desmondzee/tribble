"""Ingest ACLED conflict data from a downloaded CSV into the Tribble pipeline."""

import asyncio
import csv
import json
import logging
import sys

from tribble.db import get_supabase
from tribble.ingest.acled import acled_event_to_crisis_report

logger = logging.getLogger(__name__)

# ACLED uses numeric ISO codes; map to ISO-3 alpha for the ones we need.
ISO_NUMERIC_TO_ALPHA3: dict[str, str] = {
    "728": "SSD",  # South Sudan
    "736": "SDN",  # Sudan
    "180": "COD",  # DR Congo
    "231": "ETH",  # Ethiopia
    "566": "NGA",  # Nigeria
    "706": "SOM",  # Somalia
    "887": "YEM",  # Yemen
    "804": "UKR",  # Ukraine
    "275": "PSE",  # Palestine
    "368": "IRQ",  # Iraq
    "004": "AFG",  # Afghanistan
}

GEO_PRECISION_MAP: dict[str, str] = {
    "1": "exact",
    "2": "approximate",
    "3": "admin_centroid",
}


def load_acled_csv(path: str) -> list[dict]:
    """Read an ACLED CSV and return dicts compatible with acled_event_to_crisis_report().

    Handles UTF-8 BOM and maps the numeric ISO code to ISO-3 alpha.
    """
    rows: list[dict] = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            iso_num = row.get("iso", "").strip()
            row["iso3"] = ISO_NUMERIC_TO_ALPHA3.get(iso_num, "UNK")
            rows.append(row)
    return rows


async def ingest_csv(
    csv_path: str, batch_size: int = 50
) -> dict[str, int]:
    """Ingest ACLED CSV rows as CrisisReports via the create_report_with_job RPC.

    Returns summary dict: {total, ingested, skipped, errors}.
    """
    rows = load_acled_csv(csv_path)
    db = get_supabase()

    # Load existing ACLED event IDs for deduplication
    existing_ids: set[str] = set()
    result = (
        db.table("reports")
        .select("processing_metadata->acled_event_id")
        .eq("source_type", "acled_historical")
        .execute()
    )
    for r in result.data or []:
        eid = r.get("acled_event_id")
        if eid:
            existing_ids.add(str(eid))

    stats = {"total": len(rows), "ingested": 0, "skipped": 0, "errors": 0}

    for i, row in enumerate(rows):
        event_id = row.get("event_id_cnty", "")

        if event_id in existing_ids:
            stats["skipped"] += 1
            if (i + 1) % batch_size == 0:
                logger.info("Progress: %d/%d (skipped duplicate %s)", i + 1, stats["total"], event_id)
            continue

        try:
            report = acled_event_to_crisis_report(row)
        except ValueError as exc:
            logger.warning("Skipping invalid row %s: %s", event_id, exc)
            stats["errors"] += 1
            continue

        geo_prec = GEO_PRECISION_MAP.get(
            str(row.get("geo_precision", "2")), "approximate"
        )

        try:
            db.rpc(
                "create_report_with_job",
                {
                    "p_source_type": str(report.source_type),
                    "p_mode": str(report.mode),
                    "p_anonymity": str(report.anonymity),
                    "p_event_timestamp": report.event_timestamp.isoformat(),
                    "p_latitude": report.latitude,
                    "p_longitude": report.longitude,
                    "p_narrative": report.narrative,
                    "p_language": report.language,
                    "p_crisis_categories": report.crisis_categories,
                    "p_help_categories": report.help_categories,
                    "p_processing_metadata": json.loads(
                        report.model_dump_json(include={"processing_metadata"})
                    )["processing_metadata"],
                    "p_country": row.get("country", "Unknown"),
                    "p_country_iso": row.get("iso3", "UNK"),
                    "p_location_name": row.get("location"),
                    "p_admin1": row.get("admin1"),
                    "p_admin2": row.get("admin2"),
                    "p_precision": geo_prec,
                },
            ).execute()
            stats["ingested"] += 1
        except Exception as exc:
            logger.error("Failed to ingest %s: %s", event_id, exc)
            stats["errors"] += 1

        if (i + 1) % batch_size == 0:
            logger.info(
                "Progress: %d/%d — ingested=%d skipped=%d errors=%d",
                i + 1,
                stats["total"],
                stats["ingested"],
                stats["skipped"],
                stats["errors"],
            )

    logger.info(
        "Done. total=%d ingested=%d skipped=%d errors=%d",
        stats["total"],
        stats["ingested"],
        stats["skipped"],
        stats["errors"],
    )
    return stats


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m tribble.ingest.acled_csv <path/to/acled.csv>")
        sys.exit(1)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(ingest_csv(sys.argv[1]))
