"""Candidate resolution pipeline: extraction -> candidates -> scoring -> best match."""

import os
from datetime import datetime

from tribble.geolocation.extraction import extract_place_mentions
from tribble.geolocation.providers import get_candidates
from tribble.geolocation.scoring import score_candidates
from tribble.geolocation.types import ExtractionMethod, RawReport, ResolvedEvent


def _confidence_threshold() -> float:
    """Default confidence threshold for needs_human_review. Override via GEOLOCATION_CONFIDENCE_THRESHOLD env."""
    try:
        return float(os.environ.get("GEOLOCATION_CONFIDENCE_THRESHOLD", "0.5"))
    except ValueError:
        return 0.5


def _dict_to_raw_report(d: dict) -> RawReport:
    """Convert CLI/JSON dict to RawReport."""
    text = d.get("article_text") or d.get("text") or ""
    if not text:
        raise ValueError("Report must have 'article_text' or 'text'")
    pub = d.get("publish_date")
    if isinstance(pub, str):
        try:
            pub = datetime.fromisoformat(pub.replace("Z", "+00:00"))
        except ValueError:
            pub = None
    return RawReport(
        article_text=text,
        title=d.get("title", ""),
        source_url=d.get("source_url", ""),
        source_name=d.get("source_name", ""),
        publish_date=pub,
        source_language=d.get("source_language", "en"),
        existing_lat=d.get("existing_lat") or d.get("lat"),
        existing_lng=d.get("existing_lng") or d.get("lng"),
        media_urls=d.get("media_urls") or [],
    )


def run_pipeline(
    reports: list[dict],
    *,
    confidence_threshold: float | None = None,
) -> list[ResolvedEvent]:
    """Run geolocation pipeline on a list of raw report dicts. Returns flattened events."""
    events: list[ResolvedEvent] = []
    for d in reports:
        try:
            report = _dict_to_raw_report(d)
        except ValueError:
            continue
        events.extend(resolve_report(report, confidence_threshold=confidence_threshold))
    return events


def resolve_report(
    report: RawReport,
    *,
    confidence_threshold: float | None = None,
) -> list[ResolvedEvent]:
    """Run full pipeline: extract places, resolve candidates, score, emit events."""
    mentions = extract_place_mentions(report)
    events: list[ResolvedEvent] = []

    for mention in mentions:
        candidates = get_candidates(mention, report)
        if not candidates:
            continue

        scored = score_candidates(mention, candidates, report)
        best = scored[0] if scored else None
        if not best:
            continue

        events.append(
            ResolvedEvent(
                raw_place_text=mention.raw_text,
                normalized_place_text=best.name,
                latitude=best.latitude,
                longitude=best.longitude,
                geometry_type=best.geometry_type,
                admin0=best.admin0,
                admin1=best.admin1,
                admin2=best.admin2,
                gazetteer_source=best.gazetteer_source,
                source_url=report.source_url,
                extraction_method=ExtractionMethod.GAZETTEER_MATCH,
                candidate_count=len(candidates),
                confidence_score=best.score or 0.0,
                precision_level=best.precision_level,
                evidence_summary="",
                needs_human_review=best.score is None
                or best.score < (confidence_threshold if confidence_threshold is not None else _confidence_threshold()),
            )
        )

    return events
