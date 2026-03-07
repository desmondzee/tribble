-- Enable RLS on all tables
ALTER TABLE taxonomy_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE infrastructure_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE satellite_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidence_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_jobs ENABLE ROW LEVEL SECURITY;

-- Taxonomy: public read
CREATE POLICY taxonomy_public_read ON taxonomy_terms
    FOR SELECT USING (true);

-- Incident clusters: public read (map layer)
CREATE POLICY clusters_public_read ON incident_clusters
    FOR SELECT USING (true);

-- Reports: authenticated insert, public read
CREATE POLICY reports_public_read ON reports
    FOR SELECT USING (true);

CREATE POLICY reports_authenticated_insert ON reports
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Locations: public read
CREATE POLICY locations_public_read ON locations
    FOR SELECT USING (true);

-- Everything else: service role only
-- (The service key bypasses RLS by default in Supabase,
--  so no explicit policies needed for pipeline backend access)
