from tribble.ingest.satellite import build_planetary_computer_search_params


def test_planetary_computer_params_target_sentinel2_l2a():
    params = build_planetary_computer_search_params(15.5, 32.56, "2026-03-01", "2026-03-07")
    assert params["collections"] == ["sentinel-2-l2a"]
