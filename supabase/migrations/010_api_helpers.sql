-- API helper functions for atomic writes and spatial query projection.

CREATE OR REPLACE FUNCTION create_report_with_job(
    p_source_type TEXT,
    p_mode TEXT,
    p_anonymity TEXT,
    p_event_timestamp TIMESTAMPTZ,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_narrative TEXT,
    p_language TEXT DEFAULT 'en',
    p_crisis_categories TEXT[] DEFAULT '{}',
    p_help_categories TEXT[] DEFAULT '{}',
    p_parent_report_id UUID DEFAULT NULL,
    p_processing_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (report_id UUID, location_id UUID, job_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
    v_location_id UUID;
    v_report_id UUID;
    v_job_id UUID;
BEGIN
    INSERT INTO locations (country, country_iso, geom, precision)
    VALUES (
        'Unknown',
        'UNK',
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
        'approximate'
    )
    RETURNING id INTO v_location_id;

    INSERT INTO reports (
        source_type,
        mode,
        anonymity,
        event_timestamp,
        location_id,
        narrative,
        language,
        crisis_categories,
        help_categories,
        parent_report_id,
        processing_metadata
    )
    VALUES (
        p_source_type,
        p_mode,
        p_anonymity,
        p_event_timestamp,
        v_location_id,
        p_narrative,
        p_language,
        COALESCE(p_crisis_categories, '{}'),
        COALESCE(p_help_categories, '{}'),
        p_parent_report_id,
        COALESCE(p_processing_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_report_id;

    INSERT INTO pipeline_jobs (report_id, priority)
    VALUES (v_report_id, 0)
    RETURNING id INTO v_job_id;

    RETURN QUERY SELECT v_report_id, v_location_id, v_job_id;
END;
$$;


CREATE OR REPLACE FUNCTION get_incident_clusters_geojson(
    p_min_severity DOUBLE PRECISION DEFAULT 0.0,
    p_country_iso TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 200,
    p_min_lon DOUBLE PRECISION DEFAULT NULL,
    p_min_lat DOUBLE PRECISION DEFAULT NULL,
    p_max_lon DOUBLE PRECISION DEFAULT NULL,
    p_max_lat DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    centroid_lng DOUBLE PRECISION,
    centroid_lat DOUBLE PRECISION,
    report_count INT,
    weighted_severity FLOAT,
    weighted_confidence FLOAT,
    top_need_categories TEXT[],
    access_blockers TEXT[],
    infrastructure_hazards TEXT[],
    evidence_summary TEXT,
    radius_km FLOAT,
    country TEXT,
    last_updated TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        c.id,
        ST_X(c.centroid::geometry) AS centroid_lng,
        ST_Y(c.centroid::geometry) AS centroid_lat,
        c.report_count,
        c.weighted_severity,
        c.weighted_confidence,
        c.top_need_categories,
        c.access_blockers,
        c.infrastructure_hazards,
        c.evidence_summary,
        c.radius_km,
        c.country,
        c.last_updated
    FROM incident_clusters c
    WHERE c.weighted_severity >= p_min_severity
      AND (p_country_iso IS NULL OR c.country_iso = UPPER(p_country_iso))
      AND (
            p_min_lon IS NULL
         OR p_min_lat IS NULL
         OR p_max_lon IS NULL
         OR p_max_lat IS NULL
         OR ST_Intersects(
                c.centroid::geometry,
                ST_MakeEnvelope(p_min_lon, p_min_lat, p_max_lon, p_max_lat, 4326)
            )
      )
    ORDER BY c.weighted_severity DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;
