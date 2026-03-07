import logging

import httpx

from tribble.config import get_settings

logger = logging.getLogger(__name__)


def build_planetary_computer_search_params(
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


def build_stac_search_params(
    lat: float,
    lon: float,
    date_from: str,
    date_to: str,
    max_cloud_cover: int = 30,
    limit: int = 10,
) -> dict:
    return build_planetary_computer_search_params(
        lat=lat,
        lon=lon,
        date_from=date_from,
        date_to=date_to,
        max_cloud_cover=max_cloud_cover,
        limit=limit,
    )


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
        features = r.json().get("features", [])

    results = []
    for f in features:
        try:
            links = f.get("links") or []
            results.append({
                "scene_id": f["id"],
                "acquisition_date": f.get("properties", {}).get("datetime"),
                "cloud_cover_pct": f.get("properties", {}).get("eo:cloud_cover", 0),
                "tile_url": links[0]["href"] if links else None,
                "bbox": f.get("bbox"),
            })
        except (KeyError, IndexError) as exc:
            logger.warning("Skipping malformed STAC feature: %s", exc)
    return results
