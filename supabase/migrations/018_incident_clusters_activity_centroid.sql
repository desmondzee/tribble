-- Activity-centered cluster centroid (Option A): cluster pin at the location of the
-- "anchor" report — preferring reports where satellite shows ongoing change (e.g.
-- infrastructure damage still visible), then newest by event_timestamp.
-- Uses existing satellite_observations.change_detected when present.

CREATE OR REPLACE FUNCTION refresh_incident_clusters(
    p_radius_km float DEFAULT 5.0,
    p_time_window_hours int DEFAULT NULL
)
RETURNS TABLE (clusters_updated bigint)
LANGUAGE plpgsql
AS $$
DECLARE
    v_count bigint;
BEGIN
    IF p_radius_km IS NULL OR p_radius_km <= 0 THEN
        p_radius_km := 5.0;
    END IF;

    TRUNCATE incident_clusters;

    WITH
    time_filtered AS (
        SELECT
            r.id AS report_id,
            r.event_timestamp,
            r.location_id,
            r.crisis_categories,
            l.geom,
            l.country,
            l.country_iso,
            l.admin1
        FROM reports r
        JOIN locations l ON r.location_id = l.id
        WHERE (p_time_window_hours IS NULL OR r.event_timestamp >= now() - (p_time_window_hours || ' hours')::interval)
    ),
    clustered AS (
        SELECT
            *,
            ST_ClusterDBSCAN(geom::geometry, p_radius_km / 111.32, 1) OVER () AS cid
        FROM time_filtered
    ),
    -- Locations with recent satellite-observed change (e.g. damage still visible)
    latest_satellite_change AS (
        SELECT DISTINCT ON (location_id)
            location_id,
            true AS has_change
        FROM satellite_observations
        WHERE change_detected = true
          AND acquisition_date >= now() - interval '90 days'
        ORDER BY location_id, acquisition_date DESC
    ),
    -- One anchor report per cluster: prefer satellite-confirmed change, then newest by event_timestamp
    anchor_report AS (
        SELECT DISTINCT ON (c.cid)
            c.cid,
            c.geom::geography AS centroid
        FROM clustered c
        LEFT JOIN latest_satellite_change sat ON sat.location_id = c.location_id
        ORDER BY c.cid,
                 (sat.has_change IS NOT NULL) DESC NULLS LAST,
                 c.event_timestamp DESC NULLS LAST
    ),
    latest_confidence AS (
        SELECT DISTINCT ON (report_id)
            report_id,
            urgency,
            publishability
        FROM confidence_scores
        ORDER BY report_id, created_at DESC
    ),
    grouped AS (
        SELECT
            c.cid,
            ar.centroid,
            p_radius_km AS radius_km,
            (array_agg(c.country))[1] AS country,
            (array_agg(c.country_iso))[1] AS country_iso,
            (array_agg(c.admin1))[1] AS admin1,
            count(*)::int AS report_count,
            array_agg(c.report_id) AS report_ids,
            array_agg(c.crisis_categories) AS all_cats,
            avg(cs.urgency) AS avg_urgency,
            avg(cs.publishability) AS avg_publishability
        FROM clustered c
        JOIN anchor_report ar ON ar.cid = c.cid
        LEFT JOIN latest_confidence cs ON cs.report_id = c.report_id
        GROUP BY c.cid, ar.centroid, p_radius_km
    )
    INSERT INTO incident_clusters (
        centroid,
        radius_km,
        country,
        country_iso,
        admin1,
        report_count,
        report_ids,
        top_need_categories,
        weighted_severity,
        weighted_confidence,
        access_blockers,
        infrastructure_hazards,
        evidence_summary
    )
    SELECT
        g.centroid,
        g.radius_km,
        g.country,
        g.country_iso,
        g.admin1,
        g.report_count,
        g.report_ids,
        COALESCE(
            (SELECT array_agg(DISTINCT cat ORDER BY cat)
             FROM (SELECT unnest(arr) AS cat FROM unnest(g.all_cats) AS arr) x),
            '{}'
        ),
        LEAST(1.0, GREATEST(0.0, COALESCE(g.avg_urgency, 0)::float)),
        LEAST(1.0, GREATEST(0.0, COALESCE(g.avg_publishability, 0)::float)),
        '{}',
        '{}',
        ''
    FROM grouped g;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN QUERY SELECT v_count;
END;
$$;
