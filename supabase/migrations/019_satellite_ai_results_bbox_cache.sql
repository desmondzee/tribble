-- Allow caching multiple bbox crops per scene (e.g. 5km event snapshots).
-- Drop single-scene unique index and add (scene_id, bbox) so same scene can have multiple results.

DROP INDEX IF EXISTS idx_satellite_ai_results_scene;

CREATE UNIQUE INDEX IF NOT EXISTS idx_satellite_ai_results_scene_bbox
    ON satellite_ai_results(scene_id, bbox);
