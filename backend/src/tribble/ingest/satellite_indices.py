def _safe_ratio(num: float, den: float) -> float:
    total = num + den
    if abs(total) < 1e-9:
        return 0.0
    return num / total


def _clamp(value: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, value))


def compute_indices(red: float, green: float, nir: float, swir1: float) -> dict[str, float]:
    ndvi = _safe_ratio(nir - red, nir + red)
    ndwi = _safe_ratio(green - nir, green + nir)
    mndwi = _safe_ratio(green - swir1, green + swir1)
    return {
        "ndvi": round(_clamp(ndvi, -1.0, 1.0), 4),
        "ndwi": round(_clamp(ndwi, -1.0, 1.0), 4),
        "mndwi": round(_clamp(mndwi, -1.0, 1.0), 4),
    }


def compute_quality_score(cloud_cover_pct: float, scl_clear_pct: float) -> float:
    cloud_factor = _clamp(1.0 - (cloud_cover_pct / 100.0), 0.0, 1.0)
    clear_factor = _clamp(scl_clear_pct / 100.0, 0.0, 1.0)
    return round(_clamp((0.6 * clear_factor) + (0.4 * cloud_factor), 0.0, 1.0), 4)


def compute_flood_change_scores(
    ndwi_before: float,
    ndwi_after: float,
    mndwi_before: float,
    mndwi_after: float,
) -> dict[str, float]:
    ndwi_delta = ndwi_after - ndwi_before
    mndwi_delta = mndwi_after - mndwi_before

    # Flood likelihood should rise aggressively when both water indices jump together.
    flood_score = _clamp((ndwi_delta * 0.8) + (mndwi_delta * 0.8), 0.0, 1.0)
    change_score = _clamp((abs(ndwi_delta) + abs(mndwi_delta)) * 0.8, 0.0, 1.0)

    return {
        "flood_score": round(flood_score, 4),
        "change_score": round(change_score, 4),
        "reason_codes": [
            code
            for code, cond in (
                ("ndwi_jump", ndwi_delta > 0.15),
                ("mndwi_jump", mndwi_delta > 0.15),
                ("no_significant_change", change_score < 0.15),
            )
            if cond
        ],
    }
