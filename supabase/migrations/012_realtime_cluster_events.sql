-- Realtime projection table and triggers for cluster/report change events.

CREATE TABLE IF NOT EXISTS realtime_cluster_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    report_id UUID,
    cluster_id UUID,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_realtime_cluster_events_created
    ON realtime_cluster_events(created_at DESC);


CREATE OR REPLACE FUNCTION push_realtime_cluster_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_payload JSONB;
BEGIN
    v_payload := jsonb_build_object(
        'table', TG_TABLE_NAME,
        'op', TG_OP,
        'new', to_jsonb(NEW),
        'old', to_jsonb(OLD)
    );

    INSERT INTO realtime_cluster_events (event_type, report_id, cluster_id, payload)
    VALUES (
        TG_TABLE_NAME || '_' || lower(TG_OP),
        CASE WHEN TG_TABLE_NAME = 'reports' THEN COALESCE(NEW.id, OLD.id) ELSE NULL END,
        CASE WHEN TG_TABLE_NAME = 'incident_clusters' THEN COALESCE(NEW.id, OLD.id) ELSE NULL END,
        v_payload
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;


DROP TRIGGER IF EXISTS trg_reports_realtime_events ON reports;
CREATE TRIGGER trg_reports_realtime_events
AFTER INSERT OR UPDATE ON reports
FOR EACH ROW
EXECUTE FUNCTION push_realtime_cluster_event();


DROP TRIGGER IF EXISTS trg_clusters_realtime_events ON incident_clusters;
CREATE TRIGGER trg_clusters_realtime_events
AFTER INSERT OR UPDATE ON incident_clusters
FOR EACH ROW
EXECUTE FUNCTION push_realtime_cluster_event();
