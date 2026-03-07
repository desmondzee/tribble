"""Event-driven satellite analysis: context-driven event parsing, multi-time snapshots, aid-impact synthesis."""

import json
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx

from tribble.config import get_settings
from tribble.ingest.satellite import (
    bbox_preview_url,
    search_sentinel2_scenes,
    viewable_preview_url,
)
from tribble.services.anthropic_provider import AnthropicProvider
from tribble.services.satellite_vision import get_or_create_ai_analysis_async
from tribble.utils.geo import bbox_centred_on_point

logger = logging.getLogger(__name__)

SENTINEL_COLLECTION = "sentinel-2-l2a"

EVENT_PARSE_PROMPT = """Read this conflict/news event description and infer what to look for in satellite imagery.

Extract and reply with JSON only:
1) "event_category": short label (e.g. missile_strike, shelling, battle, flood, displacement, explosion, violence_against_civilians, other).
2) "location_summary": one line describing the location.
3) "what_to_check": list of things to look for in satellite imagery based on the context of this event. Examples: infrastructure_damage, road_access, flood_extent, building_damage, hospital_school, displacement_signs, fires, craters. Choose what is relevant to this event; no fixed enum.

Event description:
---
{event_text}
---
{ontology_hint}
Reply with ONLY a JSON object, no other text."""

EVENT_OCR_PROMPT = """Extract the event description and location from this image (news/social screenshot). Output plain text only: what happened, where, and when if mentioned."""

SYNTHESIS_PROMPT = """You are a humanitarian analyst. Given this event and satellite snapshots across different time periods, assess aid impact.

Event: {event_category} at {location_summary} (event date: {event_date}). Things we looked for: {what_to_check}.

Satellite snapshots (acquisition date -> vision scores/labels):
{snapshots_text}

Does this event likely affect aid response (yes/no/uncertain)? Is infrastructure or other relevant aspects still present, damaged, or changed over time? Reply with JSON only:
- "affects_aid_response": "yes" | "no" | "uncertain"
- "infrastructure_note": one sentence
- "summary": 1-2 sentences
- "snapshot_notes": optional object with one sentence per period label (e.g. "before", "at_event", "after")"""


def _parse_json_from_response(text: str) -> dict | None:
    if not (text and text.strip()):
        return None
    stripped = text.strip()
    json_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", stripped, re.DOTALL)
    if json_match:
        stripped = json_match.group(0)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


async def parse_event_for_satellite(
    event_text: str,
    ontology_class: str | None = None,
) -> dict:
    """Parse event with context-driven LLM; return event_category, what_to_check, location_summary."""
    settings = get_settings()
    if not (settings.anthropic_api_key or "").strip():
        return {
            "event_category": "other",
            "location_summary": "",
            "what_to_check": ["infrastructure_damage"],
        }

    ontology_hint = (
        f'Known event type from data: "{ontology_class}". Use it to inform category and what_to_check.'
        if ontology_class
        else ""
    )
    prompt = EVENT_PARSE_PROMPT.format(
        event_text=event_text[:2000],
        ontology_hint=ontology_hint,
    )

    provider = AnthropicProvider(
        api_key=settings.anthropic_api_key,
        model=settings.llm_model,
    )
    result = await provider.generate(prompt)

    if result.status != "ok" or not result.text:
        return {
            "event_category": "other",
            "location_summary": (event_text[:200] or "").strip(),
            "what_to_check": ["infrastructure_damage"],
        }

    data = _parse_json_from_response(result.text)
    if not data:
        return {
            "event_category": "other",
            "location_summary": (event_text[:200] or "").strip(),
            "what_to_check": ["infrastructure_damage"],
        }

    what = data.get("what_to_check")
    if not isinstance(what, list):
        what = ["infrastructure_damage"]
    else:
        what = [str(x) for x in what]

    return {
        "event_category": str(data.get("event_category", "other")),
        "location_summary": str(data.get("location_summary", ""))[:500],
        "what_to_check": what,
    }


async def extract_event_from_image(image_url: str) -> str:
    """Use Claude vision to extract event description from an image (OCR). Returns plain text."""
    settings = get_settings()
    if not (settings.anthropic_api_key or "").strip():
        return ""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            image_bytes = resp.content
    except Exception as exc:
        logger.warning("Event OCR: failed to fetch image %s: %s", image_url[:80], exc)
        return ""

    if not image_bytes:
        return ""

    mime_type = "image/png"
    if ".jpg" in image_url.lower() or ".jpeg" in image_url.lower():
        mime_type = "image/jpeg"

    provider = AnthropicProvider(
        api_key=settings.anthropic_api_key,
        model=settings.llm_model,
    )
    result = await provider.generate_with_image(
        prompt=EVENT_OCR_PROMPT,
        image_bytes=image_bytes,
        mime_type=mime_type,
    )

    if result.status != "ok" or not result.text:
        return ""
    return (result.text or "").strip()


def _event_date_to_str(ts: str | None) -> str:
    if not ts:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        if "T" in ts:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            dt = datetime.strptime(ts[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _time_window_to_date_range(
    event_date_str: str,
    offset_days: int,
    tolerance_days: int = 7,
) -> tuple[str, str]:
    try:
        dt = datetime.strptime(event_date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        dt = datetime.now(timezone.utc)
    target = dt + timedelta(days=offset_days)
    start = (target - timedelta(days=tolerance_days)).strftime("%Y-%m-%d")
    end = (target + timedelta(days=tolerance_days)).strftime("%Y-%m-%d")
    return start, end


async def get_snapshots_for_event(
    supabase,
    event: dict,
    *,
    snapshot_km: float | None = None,
    time_windows: list[dict] | None = None,
) -> list[dict]:
    """Fetch multiple 5km×5km satellite snapshots (before/at/after) and run vision. Return list of snapshot dicts."""
    settings = get_settings()
    lat = event.get("lat")
    lng = event.get("lng")
    if lat is None or lng is None:
        return []

    km = snapshot_km if snapshot_km is not None else settings.satellite_event_snapshot_km
    request_bbox = bbox_centred_on_point(float(lat), float(lng), km)

    windows = time_windows if time_windows is not None else settings.satellite_event_time_windows
    if not windows:
        windows = [
            {"label": "at_event", "offset_days": 0, "tolerance_days": 7},
        ]

    event_date_str = _event_date_to_str(event.get("timestamp") or event.get("event_timestamp"))

    snapshots: list[dict] = []
    for win in windows:
        label = win.get("label", "snapshot")
        offset = int(win.get("offset_days", 0))
        tolerance = int(win.get("tolerance_days", 7))
        date_from, date_to = _time_window_to_date_range(event_date_str, offset, tolerance)

        try:
            scenes = await search_sentinel2_scenes(
                float(lat),
                float(lng),
                date_from,
                date_to,
                max_cloud_cover=50,
            )
        except Exception as exc:
            logger.warning("Event satellite: STAC search failed for %s: %s", label, exc)
            continue

        if not scenes:
            continue

        scene = scenes[0]
        scene_id = scene.get("scene_id", "")
        acquisition_date = scene.get("acquisition_date") or ""
        scene_bbox = scene.get("bbox") or []

        bbox_url = bbox_preview_url(SENTINEL_COLLECTION, scene_id, request_bbox)
        if not bbox_url:
            bbox_url = viewable_preview_url(SENTINEL_COLLECTION, scene_id)

        scene_row = {
            "scene_id": scene_id,
            "tile_url": scene.get("tile_url") or bbox_url,
            "bbox": scene_bbox,
            "acquisition_date": acquisition_date,
        }

        analysis = await get_or_create_ai_analysis_async(
            supabase,
            scene_id,
            scene_row,
            request_bbox=request_bbox,
            image_url_override=bbox_url,
        )

        snapshots.append({
            "period_label": label,
            "acquisition_date": acquisition_date,
            "image_url": bbox_url,
            "scene_id": scene_id,
            "satellite_analysis": analysis.to_dict_for_fusion() if analysis else None,
        })

    return snapshots


async def synthesize_aid_impact(
    parsed_event: dict,
    snapshots: list[dict],
    event_time: str,
) -> dict:
    """LLM synthesis: does event affect aid response? Summary across snapshots."""
    settings = get_settings()
    if not (settings.anthropic_api_key or "").strip() or not snapshots:
        return {
            "affects_aid_response": "uncertain",
            "infrastructure_note": "No satellite analysis available.",
            "summary": "",
            "snapshot_notes": {},
        }

    lines = []
    for s in snapshots:
        period = s.get("period_label", "?")
        acq = s.get("acquisition_date", "?")
        ai = s.get("satellite_analysis") or {}
        scores = f"flood_score_ai={ai.get('flood_score_ai', 0)}, infrastructure_damage_score_ai={ai.get('infrastructure_damage_score_ai', 0)}, labels={ai.get('labels', [])}"
        lines.append(f"- {period} (acquisition {acq}): {scores}")

    prompt = SYNTHESIS_PROMPT.format(
        event_category=parsed_event.get("event_category", "other"),
        location_summary=parsed_event.get("location_summary", ""),
        event_date=event_time,
        what_to_check=parsed_event.get("what_to_check", []),
        snapshots_text="\n".join(lines),
    )

    provider = AnthropicProvider(
        api_key=settings.anthropic_api_key,
        model=settings.llm_model,
    )
    result = await provider.generate(prompt)

    if result.status != "ok" or not result.text:
        return {
            "affects_aid_response": "uncertain",
            "infrastructure_note": "Synthesis unavailable.",
            "summary": "",
            "snapshot_notes": {},
        }

    data = _parse_json_from_response(result.text)
    if not data:
        return {
            "affects_aid_response": "uncertain",
            "infrastructure_note": "",
            "summary": (result.text or "")[:500],
            "snapshot_notes": {},
        }

    snapshot_notes = data.get("snapshot_notes")
    if not isinstance(snapshot_notes, dict):
        snapshot_notes = {}

    return {
        "affects_aid_response": data.get("affects_aid_response", "uncertain"),
        "infrastructure_note": str(data.get("infrastructure_note", ""))[:500],
        "summary": str(data.get("summary", ""))[:1000],
        "snapshot_notes": snapshot_notes,
    }


async def run_event_satellite_analysis(supabase, event: dict) -> dict:
    """Full pipeline: parse event -> multi-time snapshots -> synthesis. Returns result for one event."""
    event_id = event.get("id") or event.get("event_id")
    event_text = (event.get("description") or event.get("narrative") or "").strip()
    ontology_class = event.get("ontology_class") or (event.get("processing_metadata") or {}).get("acled_event_type")
    image_url = event.get("image_url")

    if image_url and not event_text:
        event_text = await extract_event_from_image(image_url)

    parsed_event = await parse_event_for_satellite(event_text, ontology_class=ontology_class)

    snapshots = await get_snapshots_for_event(supabase, event)

    event_ts = event.get("timestamp") or event.get("event_timestamp")
    event_time_str = _event_date_to_str(event_ts)
    aid_impact = await synthesize_aid_impact(parsed_event, snapshots, event_time_str)

    return {
        "event_id": str(event_id) if event_id else None,
        "parsed_event": parsed_event,
        "snapshots": snapshots,
        "aid_impact": aid_impact,
    }
