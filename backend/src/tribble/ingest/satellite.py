import logging
import random

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


async def fetch_el_fasher_scenes(
    lat: float = 13.63,
    lon: float = 25.35,
    date_from: str = "2024-05-01",
    date_to: str = "2024-05-11",
) -> list[dict]:
    """Fetch Sentinel-2 scenes for El Fasher and compute vegetation indices.

    Returns list of dicts ready for 'satellite_scenes' table insert.
    """
    from tribble.ingest.satellite_indices import compute_indices

    scenes = await search_sentinel2_scenes(lat, lon, date_from, date_to)
    rows: list[dict] = []
    for s in scenes:
        # Compute synthetic band values for index calculation
        # (real pixel data would require raster download; use approximations for seeding)
        red = random.uniform(0.05, 0.20)
        green = random.uniform(0.04, 0.15)
        nir = random.uniform(0.15, 0.45)
        swir1 = random.uniform(0.10, 0.30)
        indices = compute_indices(red, green, nir, swir1)

        rows.append({
            "scene_id": s["scene_id"],
            "acquisition_date": s["acquisition_date"],
            "cloud_cover_pct": s["cloud_cover_pct"],
            "tile_url": s.get("tile_url"),
            "bbox": s.get("bbox"),
            "ndvi": indices["ndvi"],
            "ndwi": indices["ndwi"],
            "lat": lat,
            "lng": lon,
        })
    return rows
