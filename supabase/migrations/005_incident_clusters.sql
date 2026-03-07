-- Incident clusters — the map display primitive
CREATE TABLE incident_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centroid GEOGRAPHY(Point, 4326) NOT NULL,
    radius_km FLOAT NOT NULL CHECK (radius_km > 0),
    country TEXT NOT NULL CHECK (char_length(country) > 0),
    country_iso CHAR(3) NOT NULL CHECK (country_iso ~ '^[A-Z]{3}$'),
    admin1 TEXT,
    report_count INT NOT NULL DEFAULT 0 CHECK (report_count >= 0),
    report_ids UUID[] NOT NULL DEFAULT '{}',
    top_need_categories TEXT[] NOT NULL DEFAULT '{}',
    weighted_severity FLOAT NOT NULL DEFAULT 0
        CHECK (weighted_severity >= 0.0 AND weighted_severity <= 1.0),
    weighted_confidence FLOAT NOT NULL DEFAULT 0
        CHECK (weighted_confidence >= 0.0 AND weighted_confidence <= 1.0),
    access_blockers TEXT[] NOT NULL DEFAULT '{}',
    infrastructure_hazards TEXT[] NOT NULL DEFAULT '{}',
    evidence_summary TEXT NOT NULL DEFAULT '',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clusters_geom ON incident_clusters USING GIST(centroid);
CREATE INDEX idx_clusters_severity ON incident_clusters(weighted_severity DESC);
