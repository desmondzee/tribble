"""Risk scoring for dashboard zones and corridors."""

from urllib.parse import urlencode

from tribble.utils.geo import haversine_km as _haversine_km


def classify_baseline_vegetation(ndvi: float) -> str:
    """Classify region vegetation baseline from NDVI value."""
    return "vegetated" if ndvi > 0.25 else "arid"


def _point_to_segment_distance_km(
    point: tuple[float, float],
    seg_start: tuple[float, float],
    seg_end: tuple[float, float],
) -> float:
    """Approximate distance from a point to a line segment (in km)."""
    px, py = point
    ax, ay = seg_start
    bx, by = seg_end
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _haversine_km(px, py, ax, ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj_lat = ax + t * dx
    proj_lon = ay + t * dy
    return _haversine_km(px, py, proj_lat, proj_lon)


def compute_zone_risk_profile(
    acled_events: list[dict],
    report_type_counts: dict[str, int],
    weather: dict,
    satellite: dict,
    baseline_vegetation: str,
) -> dict[str, float]:
    """Compute composite risk profile for a cluster zone."""
    total_reports = max(sum(report_type_counts.values()), 1)

    # Conflict risk: ACLED density + conflict report types
    conflict_types = {"shelling", "gunfire", "looting", "missing_persons"}
    conflict_report_ratio = sum(report_type_counts.get(t, 0) for t in conflict_types) / total_reports
    acled_severity_scores = [
        {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}.get(e.get("severity", "low"), 0.2)
        for e in acled_events
    ]
    acled_signal = min(sum(acled_severity_scores) / 3.0, 1.0) if acled_severity_scores else 0.0
    conflict_risk = min((0.6 * acled_signal) + (0.4 * conflict_report_ratio), 1.0)

    # Water scarcity: report density + weather (low precip) + satellite NDWI
    water_reports = report_type_counts.get("water_need", 0) / total_reports
    ndwi = float(satellite.get("ndwi", 0.0))
    precip_factor = max(0.0, 1.0 - float(weather.get("precipitation_mm", 0.0) if "precipitation_mm" in weather else (1.0 - weather.get("flood_risk", 0.5))) / 20.0) if weather else 0.0
    ndwi_scarcity = max(0.0, -ndwi)  # negative NDWI = less water
    water_scarcity = min((0.5 * water_reports * 3) + (0.25 * precip_factor) + (0.25 * ndwi_scarcity), 1.0)

    # Food insecurity: report density + satellite NDVI (only if vegetated region)
    food_reports = report_type_counts.get("food_need", 0) / total_reports
    ndvi = float(satellite.get("ndvi", 0.0))
    if baseline_vegetation == "vegetated" and ndvi < 0.2:
        ndvi_stress = 0.8  # significant crop stress
    elif baseline_vegetation == "vegetated" and ndvi < 0.3:
        ndvi_stress = 0.4  # moderate stress
    else:
        ndvi_stress = 0.0  # arid region or healthy vegetation
    food_insecurity = min((0.7 * food_reports * 3) + (0.3 * ndvi_stress), 1.0)

    # Flood risk: weather + satellite NDWI rise
    flood_risk_wx = float(weather.get("flood_risk", 0.0))
    ndwi_flood = max(0.0, ndwi) * 2  # positive NDWI = water presence
    flood_risk = min((0.6 * flood_risk_wx) + (0.4 * min(ndwi_flood, 1.0)), 1.0)

    # Infrastructure damage: reports + ACLED shelling + satellite change
    infra_reports = report_type_counts.get("infrastructure_damage", 0) / total_reports
    shelling_events = sum(1 for e in acled_events if e.get("ontology_class") == "shelling")
    shelling_signal = min(shelling_events / 2.0, 1.0)
    change = float(satellite.get("change_score", 0.0))
    infrastructure_damage = min((0.4 * infra_reports * 3) + (0.4 * shelling_signal) + (0.2 * change), 1.0)

    # Access difficulty: route disruption + conflict
    route_disruption = float(weather.get("route_disruption_risk", 0.0))
    aid_blocked_ratio = report_type_counts.get("aid_blocked", 0) / total_reports
    access_difficulty = min((0.4 * route_disruption) + (0.3 * conflict_risk) + (0.3 * aid_blocked_ratio * 3), 1.0)

    return {
        "conflict_risk": round(conflict_risk, 3),
        "water_scarcity": round(water_scarcity, 3),
        "food_insecurity": round(food_insecurity, 3),
        "flood_risk": round(flood_risk, 3),
        "infrastructure_damage": round(infrastructure_damage, 3),
        "access_difficulty": round(access_difficulty, 3),
    }


def compute_corridor_risk(
    from_centroid: tuple[float, float],
    to_centroid: tuple[float, float],
    intervening_acled: list[dict],
    intervening_clusters: list[dict],
) -> dict:
    """Compute risk for traveling between two cluster centroids."""
    hazards: list[str] = []
    max_severity = 0.0

    # Check ACLED events near the path
    for event in intervening_acled:
        elat, elng = float(event.get("lat", 0)), float(event.get("lng", 0))
        dist = _point_to_segment_distance_km((elat, elng), from_centroid, to_centroid)
        if dist < 5.0:
            ontology = event.get("ontology_class", "armed_conflict")
            if ontology not in hazards:
                hazards.append(ontology)
            sev = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}.get(
                event.get("severity", "low"), 0.2
            )
            proximity_factor = max(0.0, 1.0 - dist / 5.0)
            max_severity = max(max_severity, sev * proximity_factor)

    # Check high-risk clusters near the path
    for cluster in intervening_clusters:
        clat, clng = cluster["centroid"]
        dist = _point_to_segment_distance_km((clat, clng), from_centroid, to_centroid)
        if dist < 5.0:
            risk = cluster.get("risk_level", "low")
            cluster_sev = {"critical": 1.0, "high": 0.7, "moderate": 0.4, "low": 0.1}.get(risk, 0.1)
            max_severity = max(max_severity, cluster_sev)

    # Classify risk level
    if max_severity >= 0.8:
        risk_level = "critical"
    elif max_severity >= 0.5:
        risk_level = "high"
    elif max_severity >= 0.2:
        risk_level = "moderate"
    else:
        risk_level = "low"

    return {
        "risk_level": risk_level,
        "risk_score": round(max_severity, 3),
        "hazards": hazards,
        "distance_km": round(_haversine_km(*from_centroid, *to_centroid), 1),
    }


def build_viewer_url(bbox: list[float], date: str) -> str:
    """Build EO Browser URL for visual satellite inspection."""
    params = {
        "zoom": 12,
        "lat": (bbox[1] + bbox[3]) / 2,
        "lng": (bbox[0] + bbox[2]) / 2,
        "themeId": "DEFAULT-THEME",
        "toTime": f"{date}T23:59:59.999Z",
        "datasetId": "S2L2A",
    }
    return f"https://apps.sentinel-hub.com/eo-browser/?{urlencode(params)}"
