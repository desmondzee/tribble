-- Enhance create_report_with_job with optional location metadata.
-- Fully backwards-compatible: existing callers get previous defaults.

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
    p_processing_metadata JSONB DEFAULT '{}'::jsonb,
    p_country TEXT DEFAULT 'Unknown',
    p_country_iso TEXT DEFAULT 'UNK',
    p_location_name TEXT DEFAULT NULL,
    p_admin1 TEXT DEFAULT NULL,
    p_admin2 TEXT DEFAULT NULL,
    p_precision TEXT DEFAULT 'approximate'
)
RETURNS TABLE (report_id UUID, location_id UUID, job_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
    v_location_id UUID;
    v_report_id UUID;
    v_job_id UUID;
BEGIN
    INSERT INTO locations (country, country_iso, name, admin1, admin2, geom, precision)
    VALUES (
        COALESCE(p_country, 'Unknown'),
        COALESCE(p_country_iso, 'UNK'),
        p_location_name,
        p_admin1,
        p_admin2,
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
        COALESCE(p_precision, 'approximate')
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
