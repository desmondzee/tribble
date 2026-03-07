import logging

from fastapi import APIRouter, HTTPException

from tribble.config import get_settings
from tribble.db import get_supabase
from tribble.services.gemini_provider import GeminiProvider
from tribble.services.flock_provider import FlockProvider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _build_analysis_prompt(
    events: list[dict],
    civilian_reports: list[dict],
    weather: list[dict],
) -> str:
    event_summary = "\n".join(
        f"- {e.get('timestamp','?')}: {e.get('ontology_class','?')} ({e.get('severity','?')}) "
        f"at {e.get('location_name','?')}: {e.get('description','')[:200]}"
        for e in events[:50]
    )
    report_summary = "\n".join(
        f"- {r.get('timestamp','?')}: [{r.get('report_type','?')}] {r.get('severity','?')} "
        f"at {r.get('location_name','?')}: {r.get('narrative','')[:150]}"
        for r in civilian_reports[:80]
    )
    weather_summary = "\n".join(
        f"- {w.get('date','?')}: {w.get('temperature_c','?')}°C, "
        f"humidity {w.get('humidity_pct','?')}%, precip {w.get('precipitation_mm','?')}mm"
        for w in weather[:15]
    )

    return f"""You are a humanitarian intelligence analyst for the El Fasher crisis in North Darfur, Sudan (May 2024).

Analyze the following data and produce:
1. **Situation Report**: Current status overview (2-3 paragraphs)
2. **Trend Analysis**: Key escalation/de-escalation patterns
3. **Needs Assessment**: Priority humanitarian needs ranked by urgency
4. **Recommendations**: 3-5 actionable recommendations for NGOs

## Armed Conflict Events ({len(events)} total)
{event_summary or "No events available."}

## Civilian Reports ({len(civilian_reports)} total)
{report_summary or "No civilian reports available."}

## Weather Conditions
{weather_summary or "No weather data available."}

Respond with structured analysis. Be specific about locations and dates."""


@router.post("/run")
async def run_analysis():
    """Read from Supabase tables, build data summary, send to Gemini for analysis."""
    settings = get_settings()

    try:
        sb = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    # Fetch data from Supabase
    events_resp = sb.table("events").select("*").order("timestamp", desc=True).limit(100).execute()
    reports_resp = sb.table("civilian_reports").select("*").order("timestamp", desc=True).limit(200).execute()
    weather_resp = sb.table("weather_data").select("*").order("date", desc=True).limit(15).execute()

    events = events_resp.data or []
    civilian_reports = reports_resp.data or []
    weather = weather_resp.data or []

    if not events and not civilian_reports:
        raise HTTPException(status_code=404, detail="No data available for analysis. Run seed script first.")

    prompt = _build_analysis_prompt(events, civilian_reports, weather)

    # Try Gemini first
    gemini = GeminiProvider(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
    )
    result = await gemini.generate(prompt)

    # Fall back to Flock if Gemini unavailable
    if result.status != "ok" and settings.enable_flock:
        logger.info("Gemini unavailable (%s), falling back to Flock", result.status)
        flock = FlockProvider(
            api_key=settings.flock_api_key,
            base_url=settings.flock_api_base_url,
            model=settings.flock_model,
        )
        result = await flock.generate(prompt)

    if result.status != "ok":
        raise HTTPException(
            status_code=503,
            detail=f"No LLM provider available: {result.error or result.status}",
        )

    # Store result in analysis_results table
    analysis_row = {
        "analysis_type": "situation_report",
        "summary": result.text,
        "details": result.metadata,
        "provider": result.metadata.get("provider", "unknown"),
        "model": result.model,
        "events_analyzed": len(events),
        "reports_analyzed": len(civilian_reports),
    }
    sb.table("analysis_results").insert(analysis_row).execute()

    return {
        "analysis": result.text,
        "provider": result.metadata.get("provider"),
        "model": result.model,
        "events_analyzed": len(events),
        "reports_analyzed": len(civilian_reports),
    }
