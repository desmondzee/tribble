from tribble.ingest.acled import ACLEDClient, acled_event_to_crisis_report

SAMPLE = {
    "event_id_cnty": "SDN12345",
    "event_date": "2023-04-15",
    "event_type": "Battles",
    "sub_event_type": "Armed clash",
    "actor1": "SAF",
    "actor2": "RSF",
    "admin1": "Khartoum",
    "location": "Khartoum",
    "latitude": "15.5007",
    "longitude": "32.5599",
    "fatalities": "12",
    "notes": "Clashes near airport.",
    "country": "Sudan",
    "iso3": "SDN",
}


def test_to_report():
    r = acled_event_to_crisis_report(SAMPLE)
    assert r.source_type == "acled_historical" and r.latitude == 15.5007
    assert "violence_active_threat" in r.crisis_categories


def test_protest_mapping():
    p = {**SAMPLE, "event_type": "Protests", "sub_event_type": "Peaceful protest", "fatalities": "0"}
    assert "violence_active_threat" not in acled_event_to_crisis_report(p).crisis_categories


def test_url_construction():
    params = ACLEDClient("k", "e")._build_params("Sudan", 2023, 100)
    assert params == {
        "key": "k",
        "email": "e",
        "country": "Sudan",
        "year": "2023",
        "limit": "100",
        "page": "1",
    }
