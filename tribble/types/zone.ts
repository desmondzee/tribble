import type { SourceType } from "@/types";

export type ZoneType =
  | "conflict_zone"
  | "contested_territory"
  | "controlled_territory"
  | "humanitarian_operation_area"
  | "safe_zone"
  | "no_go_zone"
  | "displacement_corridor";

export type BoundaryType =
  | "international_border"
  | "disputed_border"
  | "ceasefire_line"
  | "frontline_active"
  | "administrative_boundary";

export interface Zone {
  id: string;
  zone_type: ZoneType;
  name: string;
  geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  risk_score: number;
  controlling_entity?: string;
  confidence_score: number;
  source_type: SourceType;
  last_updated: string;
}

export interface Boundary {
  id: string;
  boundary_type: BoundaryType;
  name: string;
  geojson: GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;
  advance_direction?: number;
  confidence_score: number;
  last_updated: string;
}
