-- Sentinel-2 EO cache, analytics outputs, and ML provider job audit trail.

CREATE TABLE IF NOT EXISTS satellite_scene_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'planetary_computer',
    scene_id TEXT NOT NULL UNIQUE,
    acquisition_date TIMESTAMPTZ,
    cloud_cover_pct FLOAT NOT NULL DEFAULT 0 CHECK (cloud_cover_pct >= 0 AND cloud_cover_pct <= 100),
    scl_clear_pct FLOAT NOT NULL DEFAULT 0 CHECK (scl_clear_pct >= 0 AND scl_clear_pct <= 100),
    bbox JSONB NOT NULL DEFAULT '[]',
    assets JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_satellite_scene_cache_acq
    ON satellite_scene_cache(acquisition_date DESC);


CREATE TABLE IF NOT EXISTS satellite_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
    scene_id_before TEXT NOT NULL,
    scene_id_after TEXT NOT NULL,
    ndvi_before FLOAT NOT NULL,
    ndvi_after FLOAT NOT NULL,
    ndwi_before FLOAT NOT NULL,
    ndwi_after FLOAT NOT NULL,
    mndwi_before FLOAT NOT NULL,
    mndwi_after FLOAT NOT NULL,
    flood_score FLOAT NOT NULL CHECK (flood_score >= 0 AND flood_score <= 1),
    change_score FLOAT NOT NULL CHECK (change_score >= 0 AND change_score <= 1),
    quality_score FLOAT NOT NULL CHECK (quality_score >= 0 AND quality_score <= 1),
    method_version TEXT NOT NULL DEFAULT 'v1',
    reason_codes TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_satellite_analytics_report
    ON satellite_analytics(report_id, created_at DESC);


CREATE TABLE IF NOT EXISTS satellite_ml_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    request_payload JSONB NOT NULL DEFAULT '{}',
    response_payload JSONB NOT NULL DEFAULT '{}',
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_satellite_ml_jobs_status
    ON satellite_ml_jobs(status, created_at DESC);


CREATE TABLE IF NOT EXISTS satellite_ml_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES satellite_ml_jobs(id) ON DELETE CASCADE,
    scene_id TEXT NOT NULL,
    change_probability FLOAT NOT NULL CHECK (change_probability >= 0 AND change_probability <= 1),
    compression_ratio FLOAT NOT NULL CHECK (compression_ratio > 0),
    change_type TEXT,
    quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 1),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_satellite_ml_results_scene
    ON satellite_ml_results(scene_id, created_at DESC);
