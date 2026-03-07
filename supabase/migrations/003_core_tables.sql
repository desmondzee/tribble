-- Locations
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    admin1 TEXT,
    admin2 TEXT,
    country TEXT NOT NULL,
    country_iso CHAR(3) NOT NULL,
    geom GEOGRAPHY(Point, 4326) NOT NULL,
    precision TEXT NOT NULL DEFAULT 'approximate',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_locations_geom ON locations USING GIST(geom);
CREATE INDEX idx_locations_country ON locations(country_iso);

-- Reports
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'incident_creation',
    anonymity TEXT NOT NULL DEFAULT 'anonymous',
    event_timestamp TIMESTAMPTZ NOT NULL,
    location_id UUID REFERENCES locations(id),
    narrative TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    crisis_categories TEXT[] NOT NULL DEFAULT '{}',
    help_categories TEXT[] NOT NULL DEFAULT '{}',
    parent_report_id UUID REFERENCES reports(id),
    extracted_facts JSONB,
    processing_metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_source ON reports(source_type);
CREATE INDEX idx_reports_categories ON reports USING GIN(crisis_categories);
CREATE INDEX idx_reports_location ON reports(location_id);
CREATE INDEX idx_reports_parent ON reports(parent_report_id);
CREATE INDEX idx_reports_timestamp ON reports(event_timestamp DESC);

-- Report media
CREATE TABLE report_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Translations
CREATE TABLE translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL DEFAULT 'en',
    translated_text TEXT NOT NULL,
    model_used TEXT,
    confidence FLOAT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Source evidence (external corroboration links)
CREATE TABLE source_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    external_id TEXT,
    external_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
