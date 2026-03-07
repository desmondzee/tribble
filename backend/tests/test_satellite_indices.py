from tribble.ingest.satellite_indices import compute_flood_change_scores, compute_indices


def test_indices_and_flood_change_scores_are_computed():
    indices = compute_indices(red=0.2, green=0.3, nir=0.6, swir1=0.1)
    scores = compute_flood_change_scores(
        ndwi_before=0.08,
        ndwi_after=0.42,
        mndwi_before=0.01,
        mndwi_after=0.33,
    )
    assert "ndvi" in indices
    assert scores["flood_score"] > 0.5
