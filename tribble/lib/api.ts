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
