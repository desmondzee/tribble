import { createClient } from "./client";
import type {
  DbEvent,
  DbSubmission,
  DbZone,
  DbBoundary,
  DbNGO,
  DbDrone,
  DbSatelliteScene,
  DbCivilianReport,
  DbAnalysisResult,
} from "./types";
import type {
  HipEvent,
  UserSubmission,
  NGO,
  Drone,
  OntologyClass,
  Severity,
  SourceType,
  EventVerificationStatus,
  SubmissionStatus,
  DroneStatus,
} from "@/types";

// ---------------------------------------------------------------------------
// Mappers: DB rows → frontend types
// ---------------------------------------------------------------------------

function mapDbEvent(row: DbEvent): HipEvent {
  return {
    id: row.id,
    ontology_class: row.ontology_class as OntologyClass,
    severity: row.severity as Severity,
    lat: row.lat,
    lng: row.lng,
    region_id: row.region_id ?? "",
    location_name: row.location_name,
    timestamp: row.timestamp,
    description: row.description,
    source_type: row.source_type as SourceType,
    source_label: row.source_label,
    confidence_score: row.confidence_score,
    verification_status: row.verification_status as EventVerificationStatus,
    verified_by: row.verified_by ?? undefined,
    verified_at: row.verified_at ?? undefined,
    assigned_ngo_ids: row.assigned_ngo_ids ?? [],
    related_event_ids: row.related_event_ids ?? [],
    last_updated: row.last_updated,
  };
}

function mapDbSubmission(row: DbSubmission): UserSubmission {
  return {
    id: row.id,
    submitter_id: row.submitter_id ?? "",
    is_anonymous: row.is_anonymous,
    ontology_class_suggested: row.ontology_class_suggested as OntologyClass,
    severity_suggested: row.severity_suggested as Severity,
    lat: row.lat,
    lng: row.lng,
    region_id: row.region_id ?? undefined,
    description: row.description,
    submitted_at: row.submitted_at,
    status: row.status as SubmissionStatus,
    reviewed_by: row.reviewed_by ?? undefined,
    linked_event_id: row.linked_event_id ?? undefined,
    helios_confidence: row.helios_confidence,
    helios_similar_event_id: row.helios_similar_event_id ?? undefined,
  };
}

function mapDbDrone(row: DbDrone): Drone {
  return {
    id: row.id,
    status: row.status as DroneStatus,
    battery_pct: row.battery_pct,
    position: {
      lat: row.lat,
      lng: row.lng,
      altitude_m: row.altitude_m,
      speed_kmh: row.speed_kmh,
      heading_deg: row.heading_deg,
    },
    signal: (row.signal as Drone["signal"]) ?? undefined,
  };
}

function mapDbNGO(row: DbNGO): NGO {
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    zone_name: row.zone_name,
    colour: row.colour,
    zone_geojson: row.zone_geojson as NGO["zone_geojson"],
  };
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

export async function fetchEvents(): Promise<HipEvent[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data as DbEvent[]).map(mapDbEvent);
  } catch {
    return [];
  }
}

export async function fetchSubmissions(): Promise<UserSubmission[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return (data as DbSubmission[]).map(mapDbSubmission);
  } catch {
    return [];
  }
}

export async function fetchZones(): Promise<DbZone[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("zones").select("*");
    if (error) throw error;
    return data as DbZone[];
  } catch {
    return [];
  }
}

export async function fetchBoundaries(): Promise<DbBoundary[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("boundaries").select("*");
    if (error) throw error;
    return data as DbBoundary[];
  } catch {
    return [];
  }
}

export async function fetchNGOs(): Promise<NGO[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("ngos").select("*");
    if (error) throw error;
    return (data as DbNGO[]).map(mapDbNGO);
  } catch {
    return [];
  }
}

export async function fetchDrones(): Promise<Drone[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("drones").select("*");
    if (error) throw error;
    return (data as DbDrone[]).map(mapDbDrone);
  } catch {
    return [];
  }
}

export async function fetchSatelliteScenes(): Promise<DbSatelliteScene[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("satellite_scenes")
      .select("*")
      .order("acquisition_date", { ascending: false });
    if (error) throw error;
    return data as DbSatelliteScene[];
  } catch {
    return [];
  }
}

export async function fetchCivilianReports(): Promise<DbCivilianReport[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("civilian_reports")
      .select("*")
      .order("timestamp", { ascending: false });
    if (error) throw error;
    return data as DbCivilianReport[];
  } catch {
    return [];
  }
}

export async function fetchAnalysisResults(): Promise<DbAnalysisResult[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("analysis_results")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as DbAnalysisResult[];
  } catch {
    return [];
  }
}

export async function submitReport(data: {
  ontology_class_suggested: string;
  severity_suggested: string;
  lat: number;
  lng: number;
  description: string;
  is_anonymous?: boolean;
  submitter_id?: string;
  region_id?: string;
}): Promise<UserSubmission | null> {
  try {
    const supabase = createClient();
    const { data: row, error } = await supabase
      .from("submissions")
      .insert({
        ...data,
        is_anonymous: data.is_anonymous ?? false,
        status: "pending",
        helios_confidence: 0,
      })
      .select()
      .single();
    if (error) throw error;
    return mapDbSubmission(row as DbSubmission);
  } catch {
    return null;
  }
}
