-- NGO relief runs: what they're doing, where from/to, what providing, optional cluster link.
-- Civilians see these on the map so they know help is coming.

CREATE TABLE ngo_relief_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Who (optional until auth is in place)
    ngo_id TEXT,
    organisation_name TEXT NOT NULL DEFAULT 'Unknown',

    -- Origin: where they are coming from
    origin_lat DOUBLE PRECISION NOT NULL CHECK (origin_lat >= -90 AND origin_lat <= 90),
    origin_lng DOUBLE PRECISION NOT NULL CHECK (origin_lng >= -180 AND origin_lng <= 180),
    origin_name TEXT,

    -- Destination: where they are going
    destination_lat DOUBLE PRECISION NOT NULL CHECK (destination_lat >= -90 AND destination_lat <= 90),
    destination_lng DOUBLE PRECISION NOT NULL CHECK (destination_lng >= -180 AND destination_lng <= 180),
    destination_name TEXT,

    -- Content
    what_doing TEXT NOT NULL DEFAULT '',
    what_providing TEXT[] NOT NULL DEFAULT '{}',

    -- Optional link to cluster they are responding to
    cluster_id UUID REFERENCES incident_clusters(id) ON DELETE SET NULL,

    -- Status for future use
    status TEXT NOT NULL DEFAULT 'en_route' CHECK (status IN ('planned', 'en_route', 'completed', 'cancelled')),

    -- Filtering by region
    country_iso CHAR(3)
);

CREATE INDEX idx_ngo_relief_runs_cluster ON ngo_relief_runs(cluster_id);
CREATE INDEX idx_ngo_relief_runs_country ON ngo_relief_runs(country_iso);
CREATE INDEX idx_ngo_relief_runs_status ON ngo_relief_runs(status);
CREATE INDEX idx_ngo_relief_runs_created ON ngo_relief_runs(created_at DESC);

-- RLS: allow anon read for civilian visibility; service_role for write.
ALTER TABLE ngo_relief_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_ngo_relief_runs" ON ngo_relief_runs
    FOR SELECT TO anon USING (true);

CREATE POLICY "service_all_ngo_relief_runs" ON ngo_relief_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE ngo_relief_runs IS 'NGO-submitted relief runs: origin, destination, what doing/providing; optional cluster link. Shown on map for civilian visibility.';
