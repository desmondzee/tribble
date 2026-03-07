-- TRIBBLE SCHEMA: 10 tables, indexes, RLS, seed data
-- ============================================================
-- Reference schema for the Tribble app (events, submissions, zones, NGOs, drones, etc.).
-- Use this as the source of truth for TypeScript types and API contracts.

-- 1. EVENTS
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_class text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  region_id text,
  location_name text NOT NULL DEFAULT '',
  timestamp timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'news_agent',
  source_label text NOT NULL DEFAULT '',
  confidence_score double precision NOT NULL DEFAULT 0.5,
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_by text,
  verified_at timestamptz,
  assigned_ngo_ids text[] DEFAULT '{}',
  related_event_ids text[] DEFAULT '{}',
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_severity ON events(severity);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_location ON events USING gist (
  ST_SetSRID(ST_MakePoint(lng, lat), 4326)
);

-- 2. SUBMISSIONS
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id text,
  is_anonymous boolean DEFAULT false,
  ontology_class_suggested text NOT NULL,
  severity_suggested text NOT NULL CHECK (severity_suggested IN ('critical','high','medium','low')),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  region_id text,
  description text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_review','verified','declined','escalated')),
  reviewed_by text,
  linked_event_id uuid REFERENCES events(id),
  helios_confidence double precision DEFAULT 0,
  helios_similar_event_id text
);

-- 3. SATELLITE_SCENES
CREATE TABLE IF NOT EXISTS satellite_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id text NOT NULL,
  acquisition_date timestamptz,
  cloud_cover_pct double precision DEFAULT 0,
  tile_url text,
  bbox jsonb,
  ndvi double precision,
  ndwi double precision,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_satellite_date ON satellite_scenes(acquisition_date DESC);

-- 4. WEATHER_DATA
CREATE TABLE IF NOT EXISTS weather_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  temperature_c double precision,
  humidity_pct double precision,
  wind_speed_ms double precision,
  precipitation_mm double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_weather_date ON weather_data(date DESC);

-- 5. CIVILIAN_REPORTS
CREATE TABLE IF NOT EXISTS civilian_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  location_name text NOT NULL DEFAULT '',
  narrative text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  timestamp timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'web',
  verified boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_civilian_reports_type ON civilian_reports(report_type);
CREATE INDEX idx_civilian_reports_timestamp ON civilian_reports(timestamp DESC);

-- 6. ANALYSIS_RESULTS
CREATE TABLE IF NOT EXISTS analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_type text NOT NULL,
  summary text NOT NULL,
  details jsonb DEFAULT '{}',
  provider text NOT NULL DEFAULT 'gemini',
  model text,
  events_analyzed int DEFAULT 0,
  reports_analyzed int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. ZONES
CREATE TABLE IF NOT EXISTS zones (
  id text PRIMARY KEY,
  zone_type text NOT NULL,
  name text NOT NULL,
  risk_score double precision DEFAULT 0.5,
  geojson jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. NGOS
CREATE TABLE IF NOT EXISTS ngos (
  id text PRIMARY KEY,
  name text NOT NULL,
  abbreviation text NOT NULL,
  zone_name text NOT NULL DEFAULT '',
  colour text NOT NULL DEFAULT '#888888',
  zone_geojson jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. BOUNDARIES
CREATE TABLE IF NOT EXISTS boundaries (
  id text PRIMARY KEY,
  boundary_type text NOT NULL,
  name text NOT NULL,
  geojson jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. DRONES
CREATE TABLE IF NOT EXISTS drones (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'standby' CHECK (status IN ('active','standby','low_battery','lost_signal')),
  battery_pct double precision DEFAULT 100,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  altitude_m double precision DEFAULT 0,
  speed_kmh double precision DEFAULT 0,
  heading_deg double precision DEFAULT 0,
  signal text DEFAULT 'strong' CHECK (signal IN ('strong','weak','lost')),
  last_updated timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PostGIS (required for idx_events_location)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- RLS POLICIES (read-only for anon, full for service key)
-- ============================================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE satellite_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE civilian_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ngos ENABLE ROW LEVEL SECURITY;
ALTER TABLE boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE drones ENABLE ROW LEVEL SECURITY;

-- Anon read access for all tables
CREATE POLICY "anon_read_events" ON events FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_submissions" ON submissions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_satellite" ON satellite_scenes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_weather" ON weather_data FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_civilian" ON civilian_reports FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_analysis" ON analysis_results FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_zones" ON zones FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_ngos" ON ngos FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_boundaries" ON boundaries FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_drones" ON drones FOR SELECT TO anon USING (true);

-- Anon insert for submissions (user-submitted reports)
CREATE POLICY "anon_insert_submissions" ON submissions FOR INSERT TO anon WITH CHECK (true);

-- Service role full access (used by backend)
CREATE POLICY "service_all_events" ON events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_submissions" ON submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_satellite" ON satellite_scenes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_weather" ON weather_data FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_civilian" ON civilian_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_analysis" ON analysis_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_zones" ON zones FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_ngos" ON ngos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_boundaries" ON boundaries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_drones" ON drones FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Zones
INSERT INTO zones (id, zone_type, name, risk_score, geojson) VALUES
('zone-elfasher-city', 'conflict_zone', 'El Fasher City Center', 0.9, '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[25.32,13.60],[25.38,13.60],[25.38,13.66],[25.32,13.66],[25.32,13.60]]]},"properties":{}}'),
('zone-abu-shouk', 'humanitarian_operation_area', 'Abu Shouk IDP Camp', 0.7, '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[25.34,13.67],[25.37,13.67],[25.37,13.70],[25.34,13.70],[25.34,13.67]]]},"properties":{}}'),
('zone-zamzam', 'humanitarian_operation_area', 'Zamzam IDP Camp', 0.85, '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[25.20,13.50],[25.28,13.50],[25.28,13.56],[25.20,13.56],[25.20,13.50]]]},"properties":{}}');

-- NGOs
INSERT INTO ngos (id, name, abbreviation, zone_name, colour) VALUES
('ngo-msf', 'Médecins Sans Frontières', 'MSF', 'El Fasher', '#FF4444'),
('ngo-icrc', 'International Committee of the Red Cross', 'ICRC', 'North Darfur', '#CC0000'),
('ngo-wfp', 'World Food Programme', 'WFP', 'Zamzam Camp', '#0066CC'),
('ngo-unhcr', 'UN Refugee Agency', 'UNHCR', 'Abu Shouk Camp', '#0099FF');

-- Boundaries
INSERT INTO boundaries (id, boundary_type, name, geojson) VALUES
('bnd-frontline', 'frontline_active', 'RSF–SAF Frontline El Fasher', '{"type":"Feature","geometry":{"type":"LineString","coordinates":[[25.20,13.55],[25.30,13.58],[25.35,13.62],[25.40,13.60]]},"properties":{}}'),
('bnd-admin', 'administrative_boundary', 'North Darfur State Boundary', '{"type":"Feature","geometry":{"type":"LineString","coordinates":[[24.80,13.30],[25.50,13.30],[25.50,14.00],[24.80,14.00]]},"properties":{}}');

-- Drones
INSERT INTO drones (id, status, battery_pct, lat, lng, altitude_m, speed_kmh, heading_deg, signal) VALUES
('drone-alpha', 'active', 82, 13.63, 25.35, 120, 45, 90, 'strong'),
('drone-bravo', 'active', 65, 13.68, 25.36, 100, 30, 180, 'strong'),
('drone-charlie', 'standby', 95, 13.55, 25.25, 0, 0, 0, 'strong');
