"""Vision-based analysis of satellite imagery (area-level only)."""

import asyncio
import json
import logging
import re

import httpx

from tribble.config import get_settings
from tribble.models.satellite_ai import SatelliteAIAnalysis
from tribble.services.anthropic_provider import AnthropicProvider

logger = logging.getLogger(__name__)

# Assess at area level only. No building-level damage claims.
SATELLITE_VISION_PROMPT = """You are analysing a satellite image for humanitarian crisis assessment. Assess at AREA level only (grid or region). Do NOT identify specific buildings or make building-level damage claims.

For this image, provide a JSON object with exactly these keys:
- "flood_score_ai": number 0-1 (likelihood of flood or significant water extent in the area)
- "infrastructure_damage_score_ai": number 0-1 (area-level likelihood of infrastructure damage, e.g. destruction or damage visible at this scale)
- "labels": array of strings, e.g. ["flood_extent"], ["possible_infrastructure_damage"], or [] if none apply

Reply with ONLY the JSON object, no other text."""


def _parse_ai_response(text: str, model: str | None) -> SatelliteAIAnalysis:
    """Parse LLM text into SatelliteAIAnalysis. Returns no_signal on parse failure."""
    if not (text and text.strip()):
        return SatelliteAIAnalysis.no_signal()

    # Extract JSON (model might wrap in markdown code block)
    stripped = text.strip()
    json_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", stripped, re.DOTALL)
    if json_match:
        stripped = json_match.group(0)
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        logger.warning("Satellite vision: failed to parse JSON from model response")
        return SatelliteAIAnalysis.no_signal()

    flood = float(data.get("flood_score_ai", 0.0))
    infra = float(data.get("infrastructure_damage_score_ai", 0.0))
    labels = data.get("labels")
    if not isinstance(labels, list):
        labels = []
    labels = [str(x) for x in labels]

    return SatelliteAIAnalysis(
        flood_score_ai=max(0.0, min(1.0, flood)),
        infrastructure_damage_score_ai=max(0.0, min(1.0, infra)),
        labels=labels,
        raw_summary=None,
        model=model,
    )


async def analyze_satellite_image(
    image_url: str,
    bbox: list[float],
    acquisition_date: str,
) -> SatelliteAIAnalysis:
    """Run vision model on satellite preview image; return area-level analysis or no_signal on failure."""
    settings = get_settings()
    if not settings.enable_satellite_ai_analysis or not (settings.anthropic_api_key or "").strip():
        return SatelliteAIAnalysis.no_signal()

    # Fetch image bytes
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        logger.warning("Satellite vision: failed to fetch image %s: %s", image_url[:80], exc)
        return SatelliteAIAnalysis.no_signal()

    if not image_bytes:
        return SatelliteAIAnalysis.no_signal()

    # Determine mime type from URL or content-type
    mime_type = "image/png"
    if ".jpg" in image_url.lower() or ".jpeg" in image_url.lower():
        mime_type = "image/jpeg"

    provider = AnthropicProvider(
        api_key=settings.anthropic_api_key,
        model=settings.llm_model,
    )
    result = await provider.generate_with_image(
        prompt=SATELLITE_VISION_PROMPT,
        image_bytes=image_bytes,
        mime_type=mime_type,
    )

    if result.status != "ok" or not result.text:
        logger.info("Satellite vision: provider returned status=%s", result.status)
        return SatelliteAIAnalysis.no_signal()

    analysis = _parse_ai_response(result.text, model=result.model)
    return analysis


async def get_or_create_ai_analysis_async(
    supabase,
    scene_id: str,
    scene_row: dict,
    request_bbox: list[float] | None = None,
    image_url_override: str | None = None,
) -> SatelliteAIAnalysis:
    """Look up cached AI result by (scene_id, bbox); if missing and flag on, run vision and cache. Async.

    When request_bbox is provided (e.g. 5km crop), lookup and insert use that bbox; image_url_override
    should be the bbox preview URL. When request_bbox is None, use scene_row's bbox and tile_url (full scene).
    """
    settings = get_settings()
    bbox = request_bbox if request_bbox is not None else (scene_row.get("bbox") or [])
    if not isinstance(bbox, list):
        bbox = []

    try:
        resp = (
            supabase.table("satellite_ai_results")
            .select("*")
            .eq("scene_id", scene_id)
            .eq("bbox", bbox)
            .execute()
        )
    except Exception as exc:
        logger.warning("Satellite AI cache lookup failed for %s: %s", scene_id, exc)
        return SatelliteAIAnalysis.no_signal()

    if resp.data and len(resp.data) > 0:
        r = resp.data[0]
        return SatelliteAIAnalysis(
            flood_score_ai=float(r.get("flood_score_ai", 0.0)),
            infrastructure_damage_score_ai=float(r.get("infrastructure_damage_score_ai", 0.0)),
            labels=list(r.get("labels") or []),
            raw_summary=None,
            model=r.get("model"),
        )

    if not settings.enable_satellite_ai_analysis:
        return SatelliteAIAnalysis.no_signal()

    image_url = image_url_override or scene_row.get("tile_url") or ""
    if not image_url:
        return SatelliteAIAnalysis.no_signal()

    acquisition_date = str(scene_row.get("acquisition_date") or "")

    analysis = await analyze_satellite_image(
        image_url=image_url,
        bbox=bbox,
        acquisition_date=acquisition_date,
    )

    try:
        supabase.table("satellite_ai_results").insert({
            "scene_id": scene_id,
            "bbox": bbox,
            "acquisition_date": acquisition_date or None,
            "flood_score_ai": analysis.flood_score_ai,
            "infrastructure_damage_score_ai": analysis.infrastructure_damage_score_ai,
            "labels": analysis.labels,
            "model": analysis.model,
        }).execute()
    except Exception as exc:
        logger.warning("Satellite AI cache insert failed for %s: %s", scene_id, exc)

    return analysis


def get_or_create_ai_analysis(
    supabase,
    scene_id: str,
    scene_row: dict,
    request_bbox: list[float] | None = None,
    image_url_override: str | None = None,
) -> SatelliteAIAnalysis:
    """Sync wrapper for get_or_create_ai_analysis_async (e.g. pipeline)."""
    return asyncio.run(
        get_or_create_ai_analysis_async(
            supabase, scene_id, scene_row,
            request_bbox=request_bbox,
            image_url_override=image_url_override,
        )
    )
