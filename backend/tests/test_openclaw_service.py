from tribble.services.openclaw import build_cluster_answer


def test_build_cluster_answer_returns_citations():
    cluster = {
        "country": "Sudan",
        "admin1": "Khartoum",
        "report_count": 3,
        "top_need_categories": ["medical_need"],
        "evidence": [{"report_id": "r1", "excerpt": "Hospital damaged"}],
    }
    blocks = build_cluster_answer("What is happening?", cluster)
    assert any(b.type == "citation" for b in blocks)
