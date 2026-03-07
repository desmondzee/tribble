import httpx

from tribble.config import get_settings


def build_stac_search_params(
    lat: float,
    lon: float,
    date_from: str,
    date_to: str,
    max_cloud_cover: int = 30,
    limit: int = 10,
) -> dict:
    return {
        "collections": ["sentinel-2-l2a"],
        "intersects": {"type": "Point", "coordinates": [lon, lat]},
        "datetime": f"{date_from}T00:00:00Z/{date_to}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lte": max_cloud_cover}},
        "limit": limit,
        "sortby": [{"field": "datetime", "direction": "desc"}],
    }


async def search_sentinel2_scenes(
    lat: float,
    lon: float,
    date_from: str,
    date_to: str,
    max_cloud_cover: int = 30,
) -> list[dict]:
    settings = get_settings()
    params = build_stac_search_params(lat, lon, date_from, date_to, max_cloud_cover)
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.post(f"{settings.sentinel_stac_url}/search", json=params)
        r.raise_for_status()
    return [
        {
            "scene_id": f["id"],
            "acquisition_date": f.get("properties", {}).get("datetime"),
            "cloud_cover_pct": f.get("properties", {}).get("eo:cloud_cover", 0),
            "tile_url": (f["links"][0]["href"] if f.get("links") else None),
            "bbox": f.get("bbox"),
        }
        for f in r.json().get("features", [])
    ]
