import random
from datetime import datetime, timedelta, timezone

from tribble.models.report import AnonymityLevel, CrisisReport, ReportMode, SourceType

# El Fasher scenarios — civilian reports for May 1-11, 2024
REPORT_TYPES = [
    "food_need", "water_need", "medical_need", "shelter_need",
    "displacement", "shelling", "gunfire", "looting",
    "aid_blocked", "infrastructure_damage", "missing_persons",
]

SCENARIOS_EN = [
    {"template": "Heavy shelling near {loc}, multiple casualties reported", "type": "shelling", "severity": "critical"},
    {"template": "Gunfire exchange in {loc}, civilians trapped in buildings", "type": "gunfire", "severity": "critical"},
    {"template": "Food supplies exhausted in {loc}, children malnourished", "type": "food_need", "severity": "high"},
    {"template": "Water station in {loc} destroyed, no clean water for 3 days", "type": "water_need", "severity": "critical"},
    {"template": "Hospital in {loc} overwhelmed, running out of medical supplies", "type": "medical_need", "severity": "critical"},
    {"template": "Families displaced from {loc}, sheltering under trees", "type": "displacement", "severity": "high"},
    {"template": "Market in {loc} looted, food prices skyrocketing", "type": "looting", "severity": "high"},
    {"template": "Aid convoy blocked at checkpoint near {loc}", "type": "aid_blocked", "severity": "high"},
    {"template": "School building in {loc} collapsed from shelling", "type": "infrastructure_damage", "severity": "medium"},
    {"template": "Multiple families reporting missing persons from {loc}", "type": "missing_persons", "severity": "high"},
    {"template": "Shelter needed urgently in {loc}, hundreds sleeping in open", "type": "shelter_need", "severity": "high"},
    {"template": "Medical clinic in {loc} hit, staff evacuated", "type": "medical_need", "severity": "critical"},
    {"template": "Water tanker supply route to {loc} cut off", "type": "water_need", "severity": "high"},
    {"template": "Displacement wave from {loc}, thousands moving toward camps", "type": "displacement", "severity": "critical"},
    {"template": "Food distribution in {loc} disrupted by fighting", "type": "food_need", "severity": "high"},
]

SCENARIOS_AR = [
    {"template": "قصف عنيف بالقرب من {loc}، إصابات متعددة", "type": "shelling", "severity": "critical"},
    {"template": "إطلاق نار في {loc}، المدنيون محاصرون", "type": "gunfire", "severity": "critical"},
    {"template": "نفاد الغذاء في {loc}، الأطفال يعانون من سوء التغذية", "type": "food_need", "severity": "high"},
    {"template": "محطة المياه في {loc} دمرت، لا مياه نظيفة", "type": "water_need", "severity": "critical"},
    {"template": "المستشفى في {loc} يعاني من نقص حاد في الأدوية", "type": "medical_need", "severity": "critical"},
    {"template": "نزوح جماعي من {loc}، عائلات تفترش العراء", "type": "displacement", "severity": "high"},
    {"template": "نهب السوق في {loc}، ارتفاع جنوني في الأسعار", "type": "looting", "severity": "high"},
    {"template": "قافلة مساعدات محتجزة عند حاجز قرب {loc}", "type": "aid_blocked", "severity": "high"},
    {"template": "مبنى مدرسة في {loc} انهار بسبب القصف", "type": "infrastructure_damage", "severity": "medium"},
    {"template": "عائلات تبلغ عن مفقودين من {loc}", "type": "missing_persons", "severity": "high"},
]

LOCATIONS = [
    ("El Fasher city center", 13.6295, 25.3494),
    ("Abu Shouk camp", 13.6850, 25.3550),
    ("Al Salam camp", 13.6700, 25.3600),
    ("Zamzam camp", 13.5300, 25.2400),
    ("El Fasher airport", 13.6148, 25.3246),
    ("El Fasher market", 13.6310, 25.3520),
    ("University of El Fasher", 13.6400, 25.3400),
]

SOURCES = [
    (SourceType.WEB_IDENTIFIED, AnonymityLevel.IDENTIFIED),
    (SourceType.WEB_ANONYMOUS, AnonymityLevel.ANONYMOUS),
    (SourceType.WHATSAPP_IDENTIFIED, AnonymityLevel.IDENTIFIED),
    (SourceType.WHATSAPP_ANONYMOUS, AnonymityLevel.ANONYMOUS),
]


def _get_day_intensity(day: int) -> int:
    """Escalation pattern: low May 1-3, spike May 4-7, sustained May 8-11."""
    if day <= 3:
        return random.randint(25, 35)
    elif day <= 7:
        return random.randint(55, 75)
    else:
        return random.randint(40, 55)


def generate_civilian_reports(count: int = 500) -> list[dict]:
    """Generate synthetic civilian reports for El Fasher, May 1-11 2024.

    Returns list of dicts shaped for the 'civilian_reports' Supabase table.
    """
    reports: list[dict] = []
    base_date = datetime(2024, 5, 1, 0, 0, tzinfo=timezone.utc)

    # Distribute across 11 days with escalation pattern
    day_counts: list[int] = []
    for day in range(1, 12):
        day_counts.append(_get_day_intensity(day))

    # Scale to target count
    total = sum(day_counts)
    day_counts = [max(1, round(c * count / total)) for c in day_counts]

    for day_idx, day_count in enumerate(day_counts):
        day_start = base_date + timedelta(days=day_idx)
        for _ in range(day_count):
            # Pick language: ~70% Arabic, 30% English
            if random.random() < 0.7:
                scenario = random.choice(SCENARIOS_AR)
                lang = "ar"
            else:
                scenario = random.choice(SCENARIOS_EN)
                lang = "en"

            loc_name, base_lat, base_lng = random.choice(LOCATIONS)
            # Add small jitter to coordinates
            lat = round(base_lat + random.uniform(-0.02, 0.02), 6)
            lng = round(base_lng + random.uniform(-0.02, 0.02), 6)

            hour = random.randint(0, 23)
            minute = random.randint(0, 59)
            ts = day_start + timedelta(hours=hour, minutes=minute)

            reports.append({
                "report_type": scenario["type"],
                "lat": lat,
                "lng": lng,
                "location_name": loc_name,
                "narrative": scenario["template"].format(loc=loc_name),
                "language": lang,
                "severity": scenario["severity"],
                "timestamp": ts.isoformat(),
                "source": random.choice(["web", "whatsapp", "radio", "field_report"]),
                "verified": random.random() < 0.3,
            })
    return reports


def generate_dummy_reports(count: int = 50, **_) -> list[CrisisReport]:
    """Generate CrisisReport objects (legacy format, kept for compatibility)."""
    base = datetime(2024, 5, 1, 6, 0, tzinfo=timezone.utc)
    reports = []
    for _ in range(count):
        loc_name, base_lat, base_lng = random.choice(LOCATIONS)
        scenario = random.choice(SCENARIOS_EN)
        source_type, anonymity = random.choice(SOURCES)
        reports.append(
            CrisisReport(
                source_type=source_type,
                mode=ReportMode.INCIDENT_CREATION,
                anonymity=anonymity,
                event_timestamp=base + timedelta(hours=random.uniform(0, 264)),
                latitude=round(base_lat + random.uniform(-0.02, 0.02), 6),
                longitude=round(base_lng + random.uniform(-0.02, 0.02), 6),
                narrative=scenario["template"].format(loc=loc_name),
                language=random.choice(["en", "ar", "ar", "ar"]),
                crisis_categories=[scenario["type"]],
            )
        )
    return reports
