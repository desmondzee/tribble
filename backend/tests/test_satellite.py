from tribble.ingest.satellite import (
    build_stac_search_params,
    viewable_preview_url,
)


def test_params():
    p = build_stac_search_params(15.5, 32.56, "2023-04-01", "2023-04-30", 20)
    assert p["collections"] == ["sentinel-2-l2a"]
    assert p["intersects"]["coordinates"] == [32.56, 15.5]


def test_default_cloud():
    p = build_stac_search_params(0, 0, "2024-01-01", "2024-01-31")
    assert p["query"]["eo:cloud_cover"]["lte"] == 30


def test_viewable_preview_url_is_data_api_png():
    url = viewable_preview_url("sentinel-2-l2a", "S2A_MSIL2A_20240501T080601_R078_T36PUR_20240501T120000")
    assert "planetarycomputer.microsoft.com" in url
    assert "/api/data/v1/item/preview.png" in url
    assert "collection=sentinel-2-l2a" in url
    assert "item=S2A" in url
    assert "format=png" in url
