"""Generate and ingest synthetic user-submitted reports for South Sudan.

These simulate web/WhatsApp submissions from civilians and aid workers,
geographically overlapping the 361 ACLED events (May–Jun 2024) so the
pipeline can corroborate user reports against institutional data.

Usage:
    cd tribble/backend
    python -m tribble.ingest.seed_user_reports [--count 150]
"""

import asyncio
import json
import logging
import random
import sys
from datetime import datetime, timedelta, timezone

from tribble.db import get_supabase
from tribble.models.report import AnonymityLevel, ReportMode, SourceType

logger = logging.getLogger(__name__)

# ── Locations drawn from real ACLED hotspots ────────────────────────────
# (name, admin1, lat, lon, weight) — weight reflects event density
LOCATIONS = [
    ("Juba", "Central Equatoria", 4.8551, 31.5799, 14),
    ("Duk Padiet", "Jonglei", 7.7488, 31.3981, 14),
    ("Akobo", "Jonglei", 7.7913, 33.0051, 10),
    ("Malek", "Lakes", 7.2086, 29.7214, 8),
    ("Akoka", "Upper Nile", 9.7392, 32.1733, 8),
    ("Malakal", "Upper Nile", 9.5330, 31.6559, 7),
    ("Alel", "Lakes", 6.7646, 30.5514, 6),
    ("Adior", "Lakes", 6.8020, 30.7045, 6),
    ("UN House PoC Site", "Central Equatoria", 4.8096, 31.5284, 6),
    ("Kuajok", "Warrap", 8.3031, 27.9814, 5),
    ("Rubkuay", "Unity", 8.3857, 30.0801, 4),
    ("Marial Bai", "Western Bahr el Ghazal", 7.8902, 27.9777, 4),
    ("New Site", "Eastern Equatoria", 4.2501, 34.0016, 6),
    ("Burmath", "Jonglei", 7.6397, 33.0165, 6),
]

SOURCES = [
    (SourceType.WEB_IDENTIFIED, AnonymityLevel.IDENTIFIED),
    (SourceType.WEB_ANONYMOUS, AnonymityLevel.ANONYMOUS),
    (SourceType.WEB_ANONYMOUS, AnonymityLevel.ANONYMOUS),
    (SourceType.WHATSAPP_ANONYMOUS, AnonymityLevel.ANONYMOUS),
    (SourceType.WHATSAPP_IDENTIFIED, AnonymityLevel.IDENTIFIED),
]

# ── Narrative templates ─────────────────────────────────────────────────
# Each has a type that maps to crisis_categories and a severity hint.
SCENARIOS_EN = [
    {"t": "Heavy gunfire in {loc} since early morning, civilians sheltering indoors", "type": "gunfire", "sev": "critical"},
    {"t": "Clashes between armed groups near {loc}, several homes destroyed", "type": "shelling", "sev": "critical"},
    {"t": "No food distributions for two weeks in {loc}, children visibly malnourished", "type": "food_need", "sev": "high"},
    {"t": "Only borehole in {loc} area broken, people drinking river water", "type": "water_need", "sev": "critical"},
    {"t": "Clinic in {loc} has no drugs, pregnant women walking to Malakal", "type": "medical_need", "sev": "critical"},
    {"t": "Hundreds of families arrived in {loc} after fleeing fighting in nearby villages", "type": "displacement", "sev": "high"},
    {"t": "Armed men looted the market in {loc}, traders have fled", "type": "looting", "sev": "high"},
    {"t": "WFP truck turned back at checkpoint near {loc}, no reason given", "type": "aid_blocked", "sev": "high"},
    {"t": "School in {loc} destroyed, children have nowhere to study", "type": "infrastructure_damage", "sev": "medium"},
    {"t": "Three young men missing from {loc} for five days, families desperate", "type": "missing_persons", "sev": "high"},
    {"t": "Families sleeping in the open in {loc}, rainy season starting", "type": "shelter_need", "sev": "high"},
    {"t": "Cattle raid near {loc}, herders killed and livestock taken", "type": "gunfire", "sev": "critical"},
    {"t": "Aid workers evacuated from {loc} after threats, no services remaining", "type": "aid_blocked", "sev": "critical"},
    {"t": "Flooding damaged roads around {loc}, vehicles cannot pass", "type": "infrastructure_damage", "sev": "medium"},
    {"t": "Women attacked collecting firewood outside {loc}", "type": "gunfire", "sev": "high"},
]

SCENARIOS_AR = [
    {"t": "إطلاق نار كثيف في {loc} منذ الصباح الباكر", "type": "gunfire", "sev": "critical"},
    {"t": "اشتباكات بين مجموعات مسلحة بالقرب من {loc}", "type": "shelling", "sev": "critical"},
    {"t": "لا توجد توزيعات غذائية في {loc} منذ أسبوعين", "type": "food_need", "sev": "high"},
    {"t": "مصدر المياه الوحيد في {loc} معطل", "type": "water_need", "sev": "critical"},
    {"t": "العيادة في {loc} بلا أدوية", "type": "medical_need", "sev": "critical"},
    {"t": "مئات العائلات نزحت إلى {loc} هرباً من القتال", "type": "displacement", "sev": "high"},
    {"t": "رجال مسلحون نهبوا السوق في {loc}", "type": "looting", "sev": "high"},
    {"t": "شاحنة مساعدات أوقفت عند حاجز قرب {loc}", "type": "aid_blocked", "sev": "high"},
]

TYPE_TO_CATEGORIES: dict[str, list[str]] = {
    "gunfire": ["violence_active_threat"],
    "shelling": ["violence_active_threat", "infrastructure_damage"],
    "food_need": ["food_insecurity"],
    "water_need": ["public_service_interruption"],
    "medical_need": ["public_service_interruption"],
    "displacement": ["displacement"],
    "looting": ["violence_active_threat"],
    "aid_blocked": ["aid_delivery_update"],
    "infrastructure_damage": ["infrastructure_damage"],
    "missing_persons": ["violence_active_threat"],
    "shelter_need": ["displacement"],
}

# Date range matching ACLED data: May 1 – Jun 12, 2024 (43 days)
DATE_START = datetime(2024, 5, 1, tzinfo=timezone.utc)
DATE_DAYS = 43


def generate_user_reports(count: int = 150) -> list[dict]:
    """Generate synthetic user reports for South Sudan, May–Jun 2024.

    Returns dicts ready for create_report_with_job RPC.
    """
    # Weighted location selection
    loc_weights = [w for *_, w in LOCATIONS]

    reports: list[dict] = []
    for i in range(count):
        # Pick location weighted by ACLED event density
        loc_name, admin1, base_lat, base_lon, _ = random.choices(
            LOCATIONS, weights=loc_weights, k=1
        )[0]

        # 60% Arabic, 40% English
        if random.random() < 0.6:
            scenario = random.choice(SCENARIOS_AR)
            lang = "ar"
        else:
            scenario = random.choice(SCENARIOS_EN)
            lang = "en"

        source_type, anonymity = random.choice(SOURCES)

        # Random timestamp within the 43-day window
        ts = DATE_START + timedelta(
            days=random.randint(0, DATE_DAYS - 1),
            hours=random.randint(5, 22),
            minutes=random.randint(0, 59),
        )

        # Jitter coordinates ±0.03° (~3km)
        lat = round(base_lat + random.uniform(-0.03, 0.03), 6)
        lon = round(base_lon + random.uniform(-0.03, 0.03), 6)

        crisis_cats = TYPE_TO_CATEGORIES.get(scenario["type"], [])

        reports.append({
            "source_type": str(source_type),
            "mode": str(ReportMode.INCIDENT_CREATION),
            "anonymity": str(anonymity),
            "event_timestamp": ts.isoformat(),
            "latitude": lat,
            "longitude": lon,
            "narrative": scenario["t"].format(loc=loc_name),
            "language": lang,
            "crisis_categories": crisis_cats,
            "country": "South Sudan",
            "country_iso": "SSD",
            "admin1": admin1,
            "location_name": loc_name,
            "report_index": i,
        })

    return reports


def ingest_user_reports(count: int = 150) -> dict[str, int]:
    """Generate and insert synthetic user reports via create_report_with_job."""
    db = get_supabase()
    reports = generate_user_reports(count)
    stats = {"total": len(reports), "ingested": 0, "errors": 0}

    for i, r in enumerate(reports):
        try:
            db.rpc(
                "create_report_with_job",
                {
                    "p_source_type": r["source_type"],
                    "p_mode": r["mode"],
                    "p_anonymity": r["anonymity"],
                    "p_event_timestamp": r["event_timestamp"],
                    "p_latitude": r["latitude"],
                    "p_longitude": r["longitude"],
                    "p_narrative": r["narrative"],
                    "p_language": r["language"],
                    "p_crisis_categories": r["crisis_categories"],
                    "p_processing_metadata": {"seed": True, "report_index": r["report_index"]},
                    "p_country": r["country"],
                    "p_country_iso": r["country_iso"],
                    "p_location_name": r["location_name"],
                    "p_admin1": r["admin1"],
                    "p_precision": "approximate",
                },
            ).execute()
            stats["ingested"] += 1
        except Exception as exc:
            logger.error("Failed to ingest report %d: %s", i, exc)
            stats["errors"] += 1

        if (i + 1) % 50 == 0:
            logger.info("Progress: %d/%d", i + 1, stats["total"])

    logger.info(
        "Done. total=%d ingested=%d errors=%d",
        stats["total"], stats["ingested"], stats["errors"],
    )
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    count = 150
    if len(sys.argv) > 1 and sys.argv[1] == "--count":
        count = int(sys.argv[2])

    ingest_user_reports(count)
