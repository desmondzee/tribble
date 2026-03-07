from tribble.ingest.satellite import build_stac_search_params


def test_params():
    p = build_stac_search_params(15.5, 32.56, "2023-04-01", "2023-04-30", 20)
    assert p["collections"] == ["sentinel-2-l2a"]
    assert p["intersects"]["coordinates"] == [32.56, 15.5]


def test_default_cloud():
    p = build_stac_search_params(0, 0, "2024-01-01", "2024-01-31")
    assert p["query"]["eo:cloud_cover"]["lte"] == 30
