import math


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bbox_centred_on_point(lat: float, lon: float, size_km: float) -> list[float]:
    """Return [min_lon, min_lat, max_lon, max_lat] for a square of size_km × size_km centred on (lat, lon)."""
    half_deg = (size_km / 2.0) / 111.32
    min_lat = lat - half_deg
    max_lat = lat + half_deg
    min_lon = lon - half_deg
    max_lon = lon + half_deg
    return [min_lon, min_lat, max_lon, max_lat]
