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

export async function sendHeliosMessage(message: string): Promise<string> {
  const url = apiUrl("/api/helios/chat");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `HELIOS returned ${res.status}`);
  }
  const data = await res.json();
  return data.reply;
}
