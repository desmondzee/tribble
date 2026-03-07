export interface ViewportState {
  latitude: number;
  longitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

export type MapProjection = 'mercator' | 'globe';
export type MapBasemap = 'dark' | 'satellite';

export type LayerId =
  | 'A1_intl_borders' | 'A2_disputed_borders' | 'A3_admin_boundaries'
  | 'A4_frontlines' | 'A5_controlled_territory'
  | 'B1_humanitarian_ops' | 'B2_refugee_idp' | 'B3_safe_zones'
  | 'B4_no_go_zones' | 'B5_displacement_corridors'
  | 'C1_armed_conflict' | 'C2_infrastructure' | 'C3_displacement'
  | 'C4_aid_humanitarian' | 'C5_natural_environmental'
  | 'D1_risk_heatmap' | 'D2_news_feed' | 'D3_weather' | 'D4_satellite' | 'D5_conflict_arcs'
  | 'E1_drones' | 'E2_supply_routes' | 'E3_aid_points';

export type LayerGroupId = 'A' | 'B' | 'C' | 'D' | 'E';

export interface LayerDef {
  id: LayerId;
  group: LayerGroupId;
  label: string;
  defaultVisible: boolean;
  defaultOpacity: number;
}

export const LAYER_DEFS: LayerDef[] = [
  // Group A — Geopolitical Context
  { id: 'A1_intl_borders', group: 'A', label: 'Intl. Borders', defaultVisible: true, defaultOpacity: 0.4 },
  { id: 'A2_disputed_borders', group: 'A', label: 'Disputed Borders', defaultVisible: true, defaultOpacity: 1 },
  { id: 'A3_admin_boundaries', group: 'A', label: 'Admin. Boundaries', defaultVisible: false, defaultOpacity: 0.4 },
  { id: 'A4_frontlines', group: 'A', label: 'Frontlines', defaultVisible: true, defaultOpacity: 0.9 },
  { id: 'A5_controlled_territory', group: 'A', label: 'Controlled Territory', defaultVisible: true, defaultOpacity: 0.3 },
  // Group B — Humanitarian Zones
  { id: 'B1_humanitarian_ops', group: 'B', label: 'Humanitarian Ops', defaultVisible: true, defaultOpacity: 0.8 },
  { id: 'B2_refugee_idp', group: 'B', label: 'Refugee & IDP Sites', defaultVisible: true, defaultOpacity: 1 },
  { id: 'B3_safe_zones', group: 'B', label: 'Safe Zones', defaultVisible: true, defaultOpacity: 0.6 },
  { id: 'B4_no_go_zones', group: 'B', label: 'No-Go Zones', defaultVisible: true, defaultOpacity: 0.8 },
  { id: 'B5_displacement_corridors', group: 'B', label: 'Displacement Corridors', defaultVisible: true, defaultOpacity: 0.7 },
  // Group C — Events & Incidents
  { id: 'C1_armed_conflict', group: 'C', label: 'Armed Conflict', defaultVisible: true, defaultOpacity: 1 },
  { id: 'C2_infrastructure', group: 'C', label: 'Infrastructure', defaultVisible: true, defaultOpacity: 1 },
  { id: 'C3_displacement', group: 'C', label: 'Displacement', defaultVisible: true, defaultOpacity: 1 },
  { id: 'C4_aid_humanitarian', group: 'C', label: 'Aid & Humanitarian', defaultVisible: true, defaultOpacity: 1 },
  { id: 'C5_natural_environmental', group: 'C', label: 'Natural & Environmental', defaultVisible: true, defaultOpacity: 1 },
  // Group D — Intelligence Overlays
  { id: 'D1_risk_heatmap', group: 'D', label: 'Risk Heatmap', defaultVisible: true, defaultOpacity: 0.7 },
  { id: 'D2_news_feed', group: 'D', label: 'News Feed', defaultVisible: true, defaultOpacity: 0.8 },
  { id: 'D3_weather', group: 'D', label: 'Weather', defaultVisible: false, defaultOpacity: 0.5 },
  { id: 'D4_satellite', group: 'D', label: 'Satellite', defaultVisible: false, defaultOpacity: 0.5 },
  { id: 'D5_conflict_arcs', group: 'D', label: 'Conflict Arcs', defaultVisible: true, defaultOpacity: 0.6 },
  // Group E — Assets
  { id: 'E1_drones', group: 'E', label: 'Drone Positions', defaultVisible: true, defaultOpacity: 1 },
  { id: 'E2_supply_routes', group: 'E', label: 'Supply Routes', defaultVisible: true, defaultOpacity: 0.8 },
  { id: 'E3_aid_points', group: 'E', label: 'Aid Delivery Points', defaultVisible: true, defaultOpacity: 1 },
];

export const LAYER_GROUP_LABELS: Record<LayerGroupId, string> = {
  A: 'GEOPOLITICAL CONTEXT',
  B: 'HUMANITARIAN ZONES',
  C: 'EVENTS & INCIDENTS',
  D: 'INTELLIGENCE OVERLAYS',
  E: 'ASSETS',
};
