-- AI-derived satellite image analysis (area-level only). Keyed by scene_id for caching.

CREATE TABLE IF NOT EXISTS satellite_ai_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id TEXT NOT NULL,
    bbox JSONB NOT NULL DEFAULT '[]',
    acquisition_date TIMESTAMPTZ,
    flood_score_ai FLOAT NOT NULL DEFAULT 0 CHECK (flood_score_ai >= 0 AND flood_score_ai <= 1),
    infrastructure_damage_score_ai FLOAT NOT NULL DEFAULT 0 CHECK (infrastructure_damage_score_ai >= 0 AND infrastructure_damage_score_ai <= 1),
    labels JSONB NOT NULL DEFAULT '[]',
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_satellite_ai_results_scene
    ON satellite_ai_results(scene_id);

CREATE INDEX IF NOT EXISTS idx_satellite_ai_results_created
    ON satellite_ai_results(created_at DESC);
