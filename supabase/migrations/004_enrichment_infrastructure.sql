-- Infrastructure objects (hospitals, schools, bridges, etc.)
CREATE TABLE infrastructure_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    object_type TEXT NOT NULL CHECK (char_length(object_type) > 0),
    geom GEOGRAPHY(Point, 4326) NOT NULL,
    country TEXT NOT NULL CHECK (char_length(country) > 0),
    admin1 TEXT,
    status TEXT NOT NULL DEFAULT 'operational'
        CHECK (status IN ('operational', 'damaged', 'destroyed', 'unknown')),
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_infrastructure_geom ON infrastructure_objects USING GIST(geom);

-- Damage assessments
CREATE TABLE damage_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    infrastructure_id UUID NOT NULL REFERENCES infrastructure_objects(id) ON DELETE CASCADE,
    assessment_date TIMESTAMPTZ NOT NULL,
    damage_level TEXT NOT NULL CHECK (damage_level IN (
        'none', 'minor', 'moderate', 'severe', 'destroyed'
    )),
    confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    source TEXT NOT NULL,
    evidence_ids UUID[] NOT NULL DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weather snapshots
CREATE TABLE weather_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id),
    timestamp TIMESTAMPTZ NOT NULL,
    temperature_c FLOAT,
    humidity_pct FLOAT,
    wind_speed_ms FLOAT,
    condition TEXT,
    precipitation_mm FLOAT,
    flood_risk FLOAT DEFAULT 0.0 CHECK (flood_risk IS NULL OR (flood_risk >= 0.0 AND flood_risk <= 1.0)),
    storm_risk FLOAT DEFAULT 0.0 CHECK (storm_risk IS NULL OR (storm_risk >= 0.0 AND storm_risk <= 1.0)),
    heat_risk FLOAT DEFAULT 0.0 CHECK (heat_risk IS NULL OR (heat_risk >= 0.0 AND heat_risk <= 1.0)),
    route_disruption_risk FLOAT DEFAULT 0.0 CHECK (route_disruption_risk IS NULL OR (route_disruption_risk >= 0.0 AND route_disruption_risk <= 1.0)),
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_weather_location ON weather_snapshots(location_id);

-- Satellite observations
CREATE TABLE satellite_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id),
    scene_id TEXT NOT NULL,
    acquisition_date TIMESTAMPTZ NOT NULL,
    cloud_cover_pct FLOAT NOT NULL CHECK (cloud_cover_pct >= 0.0 AND cloud_cover_pct <= 100.0),
    resolution_m FLOAT NOT NULL DEFAULT 10.0,
    change_detected BOOLEAN NOT NULL DEFAULT false,
    change_type TEXT,
    change_confidence FLOAT DEFAULT 0.0 CHECK (change_confidence IS NULL OR (change_confidence >= 0.0 AND change_confidence <= 1.0)),
    tile_url TEXT CHECK (char_length(tile_url) <= 2048),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_satellite_location ON satellite_observations(location_id);
CREATE INDEX idx_satellite_changes ON satellite_observations(location_id)
    WHERE change_detected = true;
