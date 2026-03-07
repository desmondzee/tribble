// ── Tribble Map Data Layer ─────────────────────────────────────────────
// GeoJSON helpers and mock data for incident clusters.

import type { ClusterFeature } from "@/lib/api";

/**
 * Generate approximate circle polygon coordinates.
 * Returns a closed ring suitable for GeoJSON Polygon coordinates[0].
 */
export function circleRing(
  lngLat: [number, number],
  radiusKm: number,
  steps = 64
): [number, number][] {
  const [lng, lat] = lngLat;
  const latRad = (lat * Math.PI) / 180;
  const coords: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLng = (radiusKm / (111.32 * Math.cos(latRad))) * Math.cos(angle);
    const dLat = (radiusKm / 110.574) * Math.sin(angle);
    coords.push([lng + dLng, lat + dLat]);
  }

  return coords;
}

export interface ClusterForGeoJSON {
  lng: number;
  lat: number;
  radius_km?: number;
  id?: string;
}

export interface RadiusGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id?: string };
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }>;
}

/**
 * Build GeoJSON FeatureCollection of cluster radius circles (coverage-style).
 * Mirrors zerostrike buildCoverageGeoJSON: properties { id }, geometry Polygon.
 * Uses radius_km per cluster, or default 50km if missing.
 */
export function buildCoverageGeoJSON(
  clusters: ClusterForGeoJSON[],
  defaultRadiusKm = 50
): RadiusGeoJSON {
  return {
    type: "FeatureCollection",
    features: clusters.map((c) => ({
      type: "Feature" as const,
      properties: { id: c.id },
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          circleRing([c.lng, c.lat], c.radius_km ?? defaultRadiusKm),
        ],
      },
    })),
  };
}

/** Severity level from weighted_severity (0–1) */
export function severityToLevel(severity?: number): "critical" | "warning" | "watch" {
  if (severity == null) return "watch";
  if (severity >= 0.7) return "critical";
  if (severity >= 0.4) return "warning";
  return "watch";
}

/** Color for severity level — matches zerostrike threat colors */
export function levelToColor(level: "critical" | "warning" | "watch"): string {
  return level === "critical" ? "#ff2020" : level === "warning" ? "#ff6a00" : "#94a3b8";
}

export interface SeverityZoneGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { id?: string; level: string; color: string };
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }>;
}

/**
 * Build GeoJSON FeatureCollection of severity zones (threat-style).
 * Mirrors zerostrike buildThreatGeoJSON: properties { id, level, color }, geometry Polygon.
 * Uses data-driven paint via ['get', 'color'] in Mapbox layers.
 */
export function buildSeverityZoneGeoJSON(
  clusters: ClusterForGeoJSON[],
  defaultRadiusKm = 50
): SeverityZoneGeoJSON {
  return {
    type: "FeatureCollection",
    features: clusters.map((c) => {
      const sev = (c as ClusterForGeoJSON & { weighted_severity?: number }).weighted_severity;
      const level = severityToLevel(sev);
      const color = levelToColor(level);
      return {
        type: "Feature" as const,
        properties: { id: c.id, level, color },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            circleRing([c.lng, c.lat], c.radius_km ?? defaultRadiusKm),
          ],
        },
      };
    }),
  };
}

/** Normalize GeoJSON feature to flat cluster for markers/radii */
export function featureToCluster(f: ClusterFeature): ClusterForGeoJSON & Record<string, unknown> {
  const [lng, lat] = f.geometry.coordinates;
  const p = f.properties;
  return {
    id: p.id,
    lng,
    lat,
    radius_km: p.radius_km,
    report_count: p.report_count,
    weighted_severity: p.weighted_severity,
    weighted_confidence: p.weighted_confidence,
    top_need_categories: p.top_need_categories,
    access_blockers: p.access_blockers,
    infrastructure_hazards: p.infrastructure_hazards,
    evidence_summary: p.evidence_summary,
    country: p.country,
    last_updated: p.last_updated,
  };
}

/** Mock clusters for fallback when API is unavailable */
export const MOCK_CLUSTERS: ClusterFeature[] = [
  {
    type: "Feature",
    geometry: { type: "Point", coordinates: [32.6, 15.5] },
    properties: {
      id: "mock-1",
      report_count: 12,
      weighted_severity: 0.82,
      weighted_confidence: 0.7,
      top_need_categories: ["food", "health"],
      radius_km: 45,
      country: "SSD",
    },
  },
  {
    type: "Feature",
    geometry: { type: "Point", coordinates: [36.3, 3.4] },
    properties: {
      id: "mock-2",
      report_count: 8,
      weighted_severity: 0.55,
      weighted_confidence: 0.65,
      top_need_categories: ["shelter"],
      radius_km: 30,
      country: "ETH",
    },
  },
  {
    type: "Feature",
    geometry: { type: "Point", coordinates: [29.0, -1.9] },
    properties: {
      id: "mock-3",
      report_count: 5,
      weighted_severity: 0.35,
      weighted_confidence: 0.8,
      top_need_categories: ["water"],
      radius_km: 25,
      country: "BDI",
    },
  },
  {
    type: "Feature",
    geometry: { type: "Point", coordinates: [34.9, 6.0] },
    properties: {
      id: "mock-4",
      report_count: 22,
      weighted_severity: 0.91,
      weighted_confidence: 0.85,
      top_need_categories: ["security", "displacement"],
      radius_km: 60,
      country: "SSD",
    },
  },
];
