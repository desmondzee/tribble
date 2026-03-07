def _severity_label(severity: float) -> str:
    if severity >= 0.8:
        return "CRITICAL"
    if severity >= 0.6:
        return "HIGH"
    if severity >= 0.4:
        return "MODERATE"
    return "LOW"


def generate_cluster_briefing(cluster: dict) -> str:
    admin1 = cluster.get("admin1") or ""
    location = f"{admin1}, {cluster['country']}" if admin1 else cluster["country"]
    severity = cluster.get("weighted_severity", 0.0)
    confidence = cluster.get("weighted_confidence", 0.0)

    lines = [
        f"## Situation Briefing: {location}",
        "",
        f"**Severity:** {_severity_label(severity)} ({severity:.0%})",
        f"**Confidence:** {confidence:.0%}",
        f"**Reports:** {cluster.get('report_count', 0)}",
        "",
    ]

    for label, key in [
        ("Priority Needs", "top_need_categories"),
        ("Access Blockers", "access_blockers"),
        ("Infrastructure Hazards", "infrastructure_hazards"),
    ]:
        items = cluster.get(key, [])
        if items:
            lines.append(f"**{label}:**")
            lines.extend(f"- {item.replace('_', ' ').title()}" for item in items)
            lines.append("")

    weather_risks = cluster.get("weather_risks", {})
    weather_alerts = [
        name
        for key, name in [
            ("flood_risk", "flood"),
            ("heat_risk", "extreme heat"),
            ("storm_risk", "storm"),
        ]
        if weather_risks.get(key, 0) > 0.5
    ]
    if weather_alerts:
        lines.extend([f"**Weather:** {', '.join(weather_alerts)}", ""])

    evidence_summary = cluster.get("evidence_summary")
    if evidence_summary:
        lines.extend([f"**Evidence:** {evidence_summary}", ""])

    return "\n".join(lines)
