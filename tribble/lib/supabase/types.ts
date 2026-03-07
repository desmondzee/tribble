/**
 * Raw database row types matching the Supabase schema.
 * These are distinct from the frontend display types (HipEvent, Drone, etc.)
 * and represent the shape of data as stored in Postgres.
 */

export interface DbEvent {
  id: string;
  ontology_class: string;
  severity: string;
  lat: number;
  lng: number;
  region_id: string | null;
  location_name: string;
  timestamp: string;
  description: string;
  source_type: string;
  source_label: string;
  confidence_score: number;
  verification_status: string;
  verified_by: string | null;
  verified_at: string | null;
  assigned_ngo_ids: string[];
  related_event_ids: string[];
  last_updated: string;
  created_at: string;
}

export interface DbSubmission {
  id: string;
  submitter_id: string | null;
  is_anonymous: boolean;
  ontology_class_suggested: string;
  severity_suggested: string;
  lat: number;
  lng: number;
  region_id: string | null;
  description: string;
  submitted_at: string;
  status: string;
  reviewed_by: string | null;
  linked_event_id: string | null;
  helios_confidence: number;
  helios_similar_event_id: string | null;
}

export interface DbZone {
  id: string;
  zone_type: string;
  name: string;
  risk_score: number;
  geojson: GeoJSON.Feature;
  created_at: string;
}

export interface DbBoundary {
  id: string;
  boundary_type: string;
  name: string;
  geojson: GeoJSON.Feature;
  created_at: string;
}

export interface DbNGO {
  id: string;
  name: string;
  abbreviation: string;
  zone_name: string;
  colour: string;
  zone_geojson: GeoJSON.Feature | null;
  created_at: string;
}

export interface DbDrone {
  id: string;
  status: string;
  battery_pct: number;
  lat: number;
  lng: number;
  altitude_m: number;
  speed_kmh: number;
  heading_deg: number;
  signal: string | null;
  last_updated: string;
}

export interface DbSatelliteScene {
  id: string;
  scene_id: string;
  acquisition_date: string | null;
  cloud_cover_pct: number;
  tile_url: string | null;
  bbox: unknown;
  ndvi: number | null;
  ndwi: number | null;
  lat: number;
  lng: number;
  created_at: string;
}

export interface DbCivilianReport {
  id: string;
  report_type: string;
  lat: number;
  lng: number;
  location_name: string;
  narrative: string;
  language: string;
  severity: string;
  timestamp: string;
  source: string;
  verified: boolean;
  created_at: string;
}

export interface DbAnalysisResult {
  id: string;
  analysis_type: string;
  summary: string;
  details: Record<string, unknown>;
  provider: string;
  model: string | null;
  events_analyzed: number;
  reports_analyzed: number;
  created_at: string;
}

export interface DbWeatherData {
  id: string;
  date: string;
  lat: number;
  lng: number;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_speed_ms: number | null;
  precipitation_mm: number | null;
  created_at: string;
}
