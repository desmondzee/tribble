export type UserRole = "ngo_viewer" | "analyst" | "admin" | "individual";

export interface User {
  id: string;
  name: string;
  email: string;
  organisation: string;
  role: UserRole;
  ngo_id?: string;
  avatar_initials: string;
  region_id?: string;
}

export type Severity = "critical" | "high" | "medium" | "low";

export type OntologyClass =
  | "armed_conflict"
  | "airstrike"
  | "shelling"
  | "bridge_damaged"
  | "displacement_mass"
  | "aid_obstruction"
  | "disease_outbreak"
  | "food_distribution"
  | "suspicious_activity"
  | "water_contamination";

export type SourceType =
  | "news_agent"
  | "user_submission"
  | "satellite"
  | "weather_api"
  | "drone"
  | "analyst_input";

export type EventVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "disputed"
  | "escalated";

export interface HipEvent {
  id: string;
  ontology_class: OntologyClass;
  severity: Severity;
  lat: number;
  lng: number;
  region_id: string;
  location_name: string;
  timestamp: string;
  description: string;
  source_type: SourceType;
  source_label: string;
  confidence_score: number;
  verification_status: EventVerificationStatus;
  verified_by?: string;
  verified_at?: string;
  assigned_ngo_ids: string[];
  related_event_ids: string[];
  last_updated: string;
}

export type SubmissionStatus =
  | "pending"
  | "in_review"
  | "verified"
  | "declined"
  | "escalated";

export interface UserSubmission {
  id: string;
  submitter_id: string;
  is_anonymous: boolean;
  ontology_class_suggested: OntologyClass;
  severity_suggested: Severity;
  lat: number;
  lng: number;
  region_id?: string;
  description: string;
  submitted_at: string;
  status: SubmissionStatus;
  reviewed_by?: string;
  linked_event_id?: string;
  helios_confidence: number;
  helios_similar_event_id?: string;
}

export interface NGO {
  id: string;
  name: string;
  abbreviation: string;
  zone_name: string;
  colour: string;
  zone_geojson?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

export type HeliosStream = "A" | "B" | "C";

export type DroneStatus = "active" | "standby" | "low_battery" | "lost_signal";

export interface DronePosition {
  lat: number;
  lng: number;
  altitude_m: number;
  speed_kmh: number;
  heading_deg: number;
}

export interface Drone {
  id: string;
  status: DroneStatus;
  battery_pct: number;
  position: DronePosition;
  signal?: "strong" | "weak" | "lost";
}

export type { LayerId, LayerGroupId } from "./map";

export type IncidentType =
  | "armed_conflict"
  | "displacement"
  | "infrastructure_damage"
  | "aid_obstruction"
  | "natural_disaster"
  | "disease_outbreak";

export type VerificationStatus = "verified" | "unverified" | "pending";

export interface Incident {
  id: string;
  type: IncidentType;
  severity: Severity;
  lat: number;
  lng: number;
  location_name: string;
  timestamp: string;
  description: string;
  verification_status: VerificationStatus;
  verified_by?: string;
  assigned_ngo_ids: string[];
  risk_score: number;
  related_incident_ids: string[];
}
