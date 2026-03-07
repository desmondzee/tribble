-- RPC to fetch news events with resolved coordinates from the locations table.
CREATE OR REPLACE FUNCTION get_news_events(
    p_limit INT DEFAULT 30,
    p_country_iso TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    narrative TEXT,
    source_type TEXT,
    event_timestamp TIMESTAMPTZ,
    processing_metadata JSONB,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        r.id,
        r.narrative,
        r.source_type,
        r.event_timestamp,
        r.processing_metadata,
        ST_Y(l.geom::geometry) AS lat,
        ST_X(l.geom::geometry) AS lng
    FROM reports r
    LEFT JOIN locations l ON l.id = r.location_id
    WHERE r.source_type = 'acled_historical'
      AND (p_country_iso IS NULL OR l.country_iso = p_country_iso)
    ORDER BY r.event_timestamp DESC
    LIMIT p_limit;
$$;
