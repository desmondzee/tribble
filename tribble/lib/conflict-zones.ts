export interface StrategicRoute {
  id: string;
  name: string;
  status: "open" | "contested" | "blocked" | "destroyed";
  type: "highway" | "supply_corridor" | "border_crossing" | "bridge" | "airstrip";
  coords: [number, number][];
  notes?: string;
}

export interface ConflictZone {
  id: string;
  name: string;
  region: string;
  severity: "critical" | "high" | "medium";
  center: [number, number];
  zoom: number;
  bbox: [[number, number], [number, number]];
  activeIncidents: number;
  displaced: string;
  description: string;
  routes: StrategicRoute[];
  newsKeywords: string[];
}

export interface ConflictNewsItem {
  id: string;
  zoneId: string;
  source: string;
  headline: string;
  severity: "critical" | "high" | "medium" | "low";
  timestamp: string;
  breaking?: boolean;
}

export const SOUTH_SUDAN_ZONE: ConflictZone = {
  id: "CZ-SOUTH-SUDAN",
  name: "South Sudan",
  region: "South Sudan",
  severity: "critical",
  center: [30.5, 7.0],
  zoom: 6,
  bbox: [
    [27, 4],
    [34, 10],
  ],
  activeIncidents: 361,
  displaced: "2.3M",
  description: "Inter-communal violence, political instability.",
  newsKeywords: ["south sudan", "juba", "unity", "upper nile"],
  routes: [
    { id: "RT-SS-001", name: "Juba–Bor Highway", status: "contested", type: "highway", coords: [[31.6, 4.85], [31.6, 6.2]] },
    { id: "RT-SS-002", name: "Bentiu–Malakal Corridor", status: "blocked", type: "supply_corridor", coords: [[29.8, 9.2], [31.6, 9.5]] },
    { id: "RT-SS-003", name: "Uganda Border – Nimule", status: "open", type: "border_crossing", coords: [[32.05, 3.6], [32.05, 4.0]] },
  ],
};

export const CONFLICT_ZONES: ConflictZone[] = [
  SOUTH_SUDAN_ZONE,
  {
    id: "CZ-SUDAN-KHARTOUM",
    name: "Khartoum State",
    region: "Sudan",
    severity: "critical",
    center: [32.56, 15.5],
    zoom: 8,
    bbox: [
      [31.9, 14.9],
      [33.3, 16.15],
    ],
    activeIncidents: 47,
    displaced: "2.1M",
    description: "SAF vs RSF urban warfare.",
    newsKeywords: ["khartoum", "sudan", "RSF", "SAF"],
    routes: [
      { id: "RT-SD-001", name: "Khartoum–Port Sudan Highway", status: "contested", type: "highway", coords: [[32.56, 15.5], [33.0, 16.0], [33.8, 17.0], [34.5, 18.0], [36.0, 19.0], [37.2, 19.6]] },
      { id: "RT-SD-002", name: "Omdurman Bridge Crossing", status: "destroyed", type: "bridge", coords: [[32.45, 15.65], [32.50, 15.62], [32.55, 15.60]] },
      { id: "RT-SD-003", name: "Khartoum–Wad Medani Road", status: "blocked", type: "highway", coords: [[32.56, 15.5], [32.8, 14.8], [33.2, 14.4], [33.5, 14.4]] },
    ],
  },
  {
    id: "CZ-SUDAN-DARFUR",
    name: "Greater Darfur",
    region: "Sudan",
    severity: "critical",
    center: [25.35, 13.63],
    zoom: 6,
    bbox: [
      [22, 12],
      [28, 16],
    ],
    activeIncidents: 58,
    displaced: "1.8M",
    description: "El Fasher siege, displacement.",
    newsKeywords: ["darfur", "el fasher", "el geneina"],
    routes: [
      { id: "RT-DF-001", name: "El Fasher–Nyala Road", status: "blocked", type: "highway", coords: [[25.35, 13.63], [25.0, 13.0], [24.9, 12.5], [24.88, 12.05]] },
      { id: "RT-DF-002", name: "El Fasher–El Geneina Corridor", status: "contested", type: "supply_corridor", coords: [[25.35, 13.63], [24.0, 13.5], [23.0, 13.4], [22.44, 13.45]] },
      { id: "RT-DF-003", name: "Chad Border Crossing – Adré", status: "open", type: "border_crossing", coords: [[22.0, 13.5], [21.5, 13.5], [21.0, 13.47]] },
    ],
  },
];

export const CONFLICT_NEWS_FEED: ConflictNewsItem[] = [
  {
    id: "n1",
    zoneId: "CZ-SUDAN-KHARTOUM",
    source: "OCHA",
    headline: "RSF advances in Bahri district amid heavy fighting",
    severity: "critical",
    timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
    breaking: true,
  },
  {
    id: "n2",
    zoneId: "CZ-SUDAN-DARFUR",
    source: "MSF",
    headline: "El Fasher hospital struck — 12 casualties confirmed",
    severity: "critical",
    timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
  },
  {
    id: "n3",
    zoneId: "CZ-SUDAN-KHARTOUM",
    source: "Reuters",
    headline: "Omdurman bridge destroyed by airstrikes",
    severity: "high",
    timestamp: new Date(Date.now() - 14 * 60000).toISOString(),
  },
];
