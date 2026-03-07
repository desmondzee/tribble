"""Master seed script: populates all Supabase tables with El Fasher data.

Usage:
    cd tribble/backend
    python -m tribble.ingest.seed_supabase
"""

import asyncio
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _insert_batch(sb, table: str, rows: list[dict], batch_size: int = 100) -> int:
    """Insert rows in batches, return count of rows inserted."""
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        sb.table(table).insert(batch).execute()
        total += len(batch)
    return total


async def seed_acled(sb) -> int:
    """Fetch ACLED events for El Fasher and insert into 'events' table."""
    from tribble.config import get_settings
    from tribble.ingest.acled import ACLEDClient

    settings = get_settings()
    if not settings.acled_api_key:
        logger.warning("ACLED API key not set, skipping ACLED ingestion")
        return 0

    async with ACLEDClient(settings.acled_api_key, settings.acled_email) as client:
        rows = await client.fetch_el_fasher_events()

    if rows:
        count = _insert_batch(sb, "events", rows)
        logger.info("Inserted %d ACLED events", count)
        return count
    logger.info("No ACLED events matched El Fasher filter")
    return 0


async def seed_satellite(sb) -> int:
    """Fetch Sentinel-2 scenes for El Fasher and insert into 'satellite_scenes'."""
    from tribble.ingest.satellite import fetch_el_fasher_scenes

    try:
        rows = await fetch_el_fasher_scenes()
    except Exception as exc:
        logger.warning("Satellite fetch failed: %s", exc)
        return 0

    if rows:
        count = _insert_batch(sb, "satellite_scenes", rows)
        logger.info("Inserted %d satellite scenes", count)
        return count
    logger.info("No satellite scenes found")
    return 0


async def seed_weather(sb) -> int:
    """Fetch historical weather from Open-Meteo and insert into 'weather_data'."""
    from tribble.ingest.weather import fetch_historical_weather

    try:
        rows = await fetch_historical_weather()
    except Exception as exc:
        logger.warning("Weather fetch failed: %s", exc)
        return 0

    if rows:
        count = _insert_batch(sb, "weather_data", rows)
        logger.info("Inserted %d weather records", count)
        return count
    logger.info("No weather data returned")
    return 0


def seed_civilian_reports(sb) -> int:
    """Generate synthetic civilian reports and insert into 'civilian_reports'."""
    from tribble.ingest.seed import generate_civilian_reports

    rows = generate_civilian_reports(count=500)
    count = _insert_batch(sb, "civilian_reports", rows)
    logger.info("Inserted %d civilian reports", count)
    return count


async def seed_analysis(sb) -> int:
    """Run Gemini analysis on seeded data and insert into 'analysis_results'."""
    from tribble.config import get_settings
    from tribble.services.gemini_provider import GeminiProvider

    settings = get_settings()
    if not settings.gemini_api_key:
        logger.warning("Gemini API key not set, skipping analysis")
        return 0

    # Fetch data for analysis prompt
    events = (sb.table("events").select("*").limit(50).execute()).data or []
    reports = (sb.table("civilian_reports").select("*").limit(100).execute()).data or []
    weather = (sb.table("weather_data").select("*").limit(15).execute()).data or []

    if not events and not reports:
        logger.warning("No data for analysis, skipping")
        return 0

    from tribble.api.analysis import _build_analysis_prompt

    prompt = _build_analysis_prompt(events, reports, weather)
    gemini = GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model)
    result = await gemini.generate(prompt)

    if result.status != "ok":
        logger.warning("Gemini analysis failed: %s", result.error)
        return 0

    row = {
        "analysis_type": "situation_report",
        "summary": result.text,
        "details": result.metadata,
        "provider": "gemini",
        "model": result.model,
        "events_analyzed": len(events),
        "reports_analyzed": len(reports),
    }
    sb.table("analysis_results").insert(row).execute()
    logger.info("Inserted 1 analysis result")
    return 1


async def main():
    from tribble.db import get_supabase

    try:
        sb = get_supabase()
    except RuntimeError as e:
        logger.error("Cannot connect to Supabase: %s", e)
        sys.exit(1)

    logger.info("Starting Tribble data seeding for El Fasher...")
    totals: dict[str, int] = {}

    # 1. ACLED events
    totals["events"] = await seed_acled(sb)

    # 2. Satellite scenes
    totals["satellite_scenes"] = await seed_satellite(sb)

    # 3. Weather data
    totals["weather_data"] = await seed_weather(sb)

    # 4. Civilian reports (sync)
    totals["civilian_reports"] = seed_civilian_reports(sb)

    # 5. Analysis (depends on data being seeded first)
    totals["analysis_results"] = await seed_analysis(sb)

    logger.info("Seeding complete! Summary:")
    for table, count in totals.items():
        logger.info("  %s: %d rows", table, count)


if __name__ == "__main__":
    asyncio.run(main())
