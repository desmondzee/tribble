// ── Tribble API Service Layer ──────────────────────────────────────────
// Single source of truth for map/backend endpoints.
// If NEXT_PUBLIC_API_URL is not set, calls throw and DataContext uses mock data.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || null;

export interface GetClustersParams {
  bbox?: string; // minLon,minLat,maxLon,maxLat
  min_severity?: number;
  country_iso?: string;
  limit?: number;
}

export interface ClusterFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id?: string;
    report_count?: number;
    weighted_severity?: number;
    weighted_confidence?: number;
    top_need_categories?: string[];
    access_blockers?: string[];
    infrastructure_hazards?: string[];
    evidence_summary?: string;
    radius_km?: number;
    country?: string;
    last_updated?: string;
  };
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: ClusterFeature[];
}

export interface NewsEvent {
  id: string;
  headline: string;
  source: string;
  severity: "critical" | "high" | "medium" | "low";
  timestamp: string | null;
  lat: number | null;
  lng: number | null;
  country: string | null;
  event_type: string | null;
}

export interface GetNewsParams {
  limit?: number;
  country_iso?: string;
}

function apiUrl(path: string): string {
  if (!BASE_URL) throw new Error("No API URL configured — using mock data");
  return `${BASE_URL}${path}`;
}

async function apiFetch(path: string, searchParams?: URLSearchParams): Promise<GeoJSONFeatureCollection> {
  const url = searchParams ? `${apiUrl(path)}?${searchParams}` : apiUrl(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json();
}

/**
 * Fetch incident clusters as GeoJSON FeatureCollection.
 * Query params: bbox (minLon,minLat,maxLon,maxLat), min_severity, country_iso, limit
 */
export async function getClusters(params?: GetClustersParams): Promise<GeoJSONFeatureCollection> {
  const sp = new URLSearchParams();
  if (params?.bbox) sp.set("bbox", params.bbox);
  if (params?.min_severity != null) sp.set("min_severity", String(params.min_severity));
  if (params?.country_iso) sp.set("country_iso", params.country_iso);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  return apiFetch("/api/clusters", sp.size ? sp : undefined);
}

// ── Report submission ────────────────────────────────────────────────────

export interface ReportSubmission {
  latitude: number;
  longitude: number;
  narrative: string;
  crisis_categories: string[];
  help_categories: string[];
  anonymous: boolean;
  country?: string;
  country_iso?: string;
}

export interface ReportResponse {
  report_id: string;
  status: string;
}

export async function submitReport(data: ReportSubmission): Promise<ReportResponse> {
  const url = apiUrl("/api/reports");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API /api/reports returned ${res.status}`);
  }
  return res.json();
}

// ── Weather at point (pre-submit validity) ───────────────────────────────────

export interface WeatherAtPointResponse {
  temperature_c: number;
  humidity_pct: number;
  wind_speed_ms: number;
  condition: string;
  precipitation_mm: number;
  risks: {
    flood_risk: number;
    storm_risk: number;
    heat_risk: number;
    route_disruption_risk: number;
  };
  validity_hint: string;
}

export async function getWeatherAtPoint(params: {
  lat: number;
  lng: number;
  date?: string;
}): Promise<WeatherAtPointResponse> {
  const sp = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lng),
  });
  if (params.date) sp.set("date", params.date);
  const url = `${apiUrl("/api/weather/at-point")}?${sp}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API /api/weather/at-point returned ${res.status}`);
  }
  return res.json();
}

// ── Report validation (post-submit validity) ─────────────────────────────────

export interface ValidationSource {
  confirmed: boolean;
  signal: string;
  confidence: number;
}

export interface ReportValidationResponse {
  confidence_scores: { publishability: number; urgency: number; access_difficulty: number };
  validation_context: {
    weather?: ValidationSource;
    satellite?: ValidationSource;
    acled?: ValidationSource;
    llm_verification?: unknown;
  };
  breakdown?: Record<string, unknown>;
}

export async function getReportValidation(reportId: string): Promise<ReportValidationResponse> {
  const url = apiUrl(`/api/reports/${reportId}/validation`);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API /api/reports/${reportId}/validation returned ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch ACLED events as news items for the live feed.
 */
export async function getNewsEvents(params?: GetNewsParams): Promise<NewsEvent[]> {
  const sp = new URLSearchParams();
  if (params?.limit != null) sp.set("limit", String(params.limit));
  if (params?.country_iso) sp.set("country_iso", params.country_iso);
  const url = sp.size ? `${apiUrl("/api/events/news")}?${sp}` : apiUrl("/api/events/news");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API /api/events/news returned ${res.status}`);
  const data = await res.json();
  return data.items;
}

// ── HELIOS AI Chat ────────────────────────────────────────────────────

export async function sendHeliosMessage(
  message: string,
  persona?: "civilian" | "organization"
): Promise<string> {
  const url = apiUrl("/api/helios/chat");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, persona: persona ?? undefined }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `HELIOS returned ${res.status}`);
  }
  const data = await res.json();
  return data.reply;
}

export async function sendEventsSummaryMessage(
  message: string,
  events: NewsEvent[]
): Promise<string> {
  const url = apiUrl("/api/helios/summarize");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      events: events.map((e) => ({
        id: e.id,
        headline: e.headline,
        source: e.source,
        severity: e.severity,
        lat: e.lat,
        lng: e.lng,
        event_type: e.event_type,
      })),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg =
      res.status === 503 && body.includes("not configured")
        ? "Summary unavailable. Set TRIBBLE_ANTHROPIC_API_KEY in the backend .env and restart the backend."
        : (() => {
            try {
              const o = JSON.parse(body);
              return typeof o.detail === "string" ? o.detail : body || `Events summary returned ${res.status}`;
            } catch {
              return body || `Events summary returned ${res.status}`;
            }
          })();
    throw new Error(msg);
  }
  const data = await res.json();
  return data.reply;
}

// ── Satellite Scenes ─────────────────────────────────────────────────────

export interface SatelliteScene {
  id: string;
  scene_id: string;
  acquisition_date: string | null;
  cloud_cover_pct: number | null;
  tile_url: string | null;
  bbox: number[] | null;
  ndvi: number | null;
  ndwi: number | null;
  lat: number;
  lng: number;
}

export interface SatelliteSceneInterval {
  label: string;
  date_from: string;
  date_to: string;
}

export interface SatelliteScenesIntervalsResponse {
  min_date: string | null;
  max_date: string | null;
  intervals: SatelliteSceneInterval[];
}

export async function getSatelliteScenesIntervals(): Promise<SatelliteScenesIntervalsResponse> {
  const url = apiUrl("/api/satellite/scenes/intervals");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API /api/satellite/scenes/intervals returned ${res.status}`);
  return res.json();
}

export interface SatelliteScenesResponse {
  scenes: SatelliteScene[];
  date_from: string;
  date_to: string;
}

export async function getSatelliteScenes(
  dateFrom: string,
  dateTo: string
): Promise<SatelliteScenesResponse> {
  const sp = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  const url = `${apiUrl("/api/satellite/scenes")}?${sp}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API /api/satellite/scenes returned ${res.status}`);
  return res.json();
}

/** URL for the proxied satellite preview image (same-origin so images load reliably). */
export function getSatellitePreviewUrl(sceneId: string, collection = "sentinel-2-l2a"): string {
  const params = new URLSearchParams({ scene_id: sceneId, collection });
  return `${apiUrl("/api/satellite/preview")}?${params.toString()}`;
}

// ── Route suggestion (maps agent) ───────────────────────────────────────────

export interface RouteSuggestParams {
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  avoid_recent_hours?: number;
  country_iso?: string;
}

export interface RecentEventNearby {
  id: string;
  headline: string;
  lat: number;
  lng: number;
  timestamp: string | null;
  severity: string;
}

export interface SuggestedRoute {
  type: "primary" | "alternative";
  summary: string;
  waypoints_or_corridor: number[][];
  risk_level: string;
  advisory: string;
  distance_km?: number;
  recommended?: boolean;
}

export interface RouteSuggestResponse {
  recent_events_nearby: RecentEventNearby[];
  suggested_routes: SuggestedRoute[];
  narrative: string | null;
}

export async function getRouteSuggest(params: RouteSuggestParams): Promise<RouteSuggestResponse> {
  const sp = new URLSearchParams({
    from_lat: String(params.from_lat),
    from_lng: String(params.from_lng),
    to_lat: String(params.to_lat),
    to_lng: String(params.to_lng),
  });
  if (params.avoid_recent_hours != null) sp.set("avoid_recent_hours", String(params.avoid_recent_hours));
  if (params.country_iso) sp.set("country_iso", params.country_iso);
  const url = `${apiUrl("/api/routes/suggest")}?${sp}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API /api/routes/suggest returned ${res.status}`);
  }
  return res.json();
}

// ── NGO Relief runs (submit + list for map and cluster panel) ────────────────

export interface ReliefRunSubmission {
  origin: { lat: number; lng: number; name?: string };
  destination: { lat: number; lng: number; name?: string };
  what_doing: string;
  what_providing: string[];
  cluster_id?: string;
  organisation_name?: string;
  country_iso?: string;
}

export interface ReliefRunResponse {
  id: string;
  status: string;
}

export interface ReliefRunItem {
  id: string;
  origin_lat: number;
  origin_lng: number;
  origin_name: string | null;
  destination_lat: number;
  destination_lng: number;
  destination_name: string | null;
  what_doing: string;
  what_providing: string[];
  organisation_name: string;
  cluster_id: string | null;
  status: string;
  created_at: string;
}

export interface ReliefRunsResponse {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: {
      id: string;
      type: "relief_run";
      what_doing: string;
      what_providing: string[];
      organisation_name: string;
      cluster_id: string | null;
      status: string;
    };
  }>;
  items: ReliefRunItem[];
}

export interface GetReliefParams {
  cluster_id?: string;
  country_iso?: string;
  status?: string;
  bbox?: string;
  limit?: number;
}

export async function getReliefRuns(params?: GetReliefParams): Promise<ReliefRunsResponse> {
  const sp = new URLSearchParams();
  if (params?.cluster_id) sp.set("cluster_id", params.cluster_id);
  if (params?.country_iso) sp.set("country_iso", params.country_iso);
  if (params?.status) sp.set("status", params.status);
  if (params?.bbox) sp.set("bbox", params.bbox);
  if (params?.limit != null) sp.set("limit", String(params.limit));
  const url = sp.size ? `${apiUrl("/api/relief")}?${sp}` : apiUrl("/api/relief");
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API /api/relief returned ${res.status}`);
  }
  return res.json();
}

export async function getReliefRunsByCluster(clusterId: string): Promise<{ items: ReliefRunItem[] }> {
  const url = apiUrl(`/api/clusters/${clusterId}/relief`);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API /api/clusters/${clusterId}/relief returned ${res.status}`);
  }
  return res.json();
}

export async function submitReliefRun(data: ReliefRunSubmission): Promise<ReliefRunResponse> {
  const url = apiUrl("/api/relief");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `API /api/relief returned ${res.status}`);
  }
  return res.json();
}
