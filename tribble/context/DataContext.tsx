"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { getClusters, type GeoJSONFeatureCollection } from "@/lib/api";
import { fetchGeolocationGeoJSON } from "@/lib/geolocation-api";
import { MOCK_CLUSTERS } from "@/data/mapData";
import {
  PLACEHOLDER_EVENTS,
  PLACEHOLDER_DRONES,
  PLACEHOLDER_ZONES,
  PLACEHOLDER_BOUNDARIES,
  PLACEHOLDER_NGOS,
} from "@/lib/placeholder-data";
import { CONFLICT_ZONES } from "@/lib/conflict-zones";

export interface GeoJSONFC {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties?: Record<string, unknown>;
  }>;
}

function buildZonesGeoJSON(): GeoJSONFC {
  return {
    type: "FeatureCollection",
    features: PLACEHOLDER_ZONES.map((z) => ({
      type: "Feature" as const,
      properties: {
        id: z.id,
        zone_type: z.zone_type,
        name: z.name,
        risk_score: z.risk_score,
      },
      geometry: z.geojson.geometry as GeoJSON.Geometry,
    })),
  };
}

function buildBoundariesGeoJSON(): GeoJSONFC {
  return {
    type: "FeatureCollection",
    features: PLACEHOLDER_BOUNDARIES.map((b) => ({
      type: "Feature" as const,
      properties: {
        id: b.id,
        boundary_type: b.boundary_type,
        name: b.name,
      },
      geometry: b.geojson.geometry as GeoJSON.Geometry,
    })),
  };
}

function buildNGOZonesGeoJSON(): GeoJSONFC {
  return {
    type: "FeatureCollection",
    features: PLACEHOLDER_NGOS.filter((n) => n.zone_geojson).map((n) => ({
      type: "Feature" as const,
      properties: {
        id: n.id,
        name: n.abbreviation,
        colour: n.colour,
      },
      geometry: n.zone_geojson!.geometry as GeoJSON.Geometry,
    })),
  };
}

function buildRoutesGeoJSON(): GeoJSONFC {
  const features = CONFLICT_ZONES.flatMap((zone) =>
    zone.routes.map((r) => ({
      type: "Feature" as const,
      properties: {
        id: r.id,
        name: r.name,
        status: r.status,
        routeType: r.type,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: r.coords,
      } as GeoJSON.LineString,
    }))
  );
  return { type: "FeatureCollection", features };
}

const DataContext = createContext<{
  clusters: GeoJSONFeatureCollection;
  geolocationEvents: GeoJSONFC;
  events: typeof PLACEHOLDER_EVENTS;
  drones: typeof PLACEHOLDER_DRONES;
  zones: GeoJSONFC;
  boundaries: GeoJSONFC;
  ngoZones: GeoJSONFC;
  routes: GeoJSONFC;
  lastUpdated: Date | null;
  isLive: boolean;
} | null>(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

const ZONES = buildZonesGeoJSON();
const BOUNDARIES = buildBoundariesGeoJSON();
const NGO_ZONES = buildNGOZonesGeoJSON();
const ROUTES = buildRoutesGeoJSON();

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [clusters, setClusters] = useState<GeoJSONFeatureCollection>({
    type: "FeatureCollection",
    features: MOCK_CLUSTERS,
  });
  const [geolocationEvents, setGeolocationEvents] = useState<GeoJSONFC>({
    type: "FeatureCollection",
    features: [],
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);

  const tryFetchClusters = useCallback(async () => {
    try {
      const data = await getClusters();
      setClusters(data);
      setIsLive(true);
      setLastUpdated(new Date());
    } catch {
      // Keep existing state (mock data or last live data)
    }
  }, []);

  const tryFetchGeolocation = useCallback(async () => {
    try {
      const data = await fetchGeolocationGeoJSON(50);
      setGeolocationEvents({
        type: "FeatureCollection",
        features: (data.features ?? []) as GeoJSONFC["features"],
      });
    } catch {
      // Keep empty; placeholder events from PLACEHOLDER_EVENTS used for display
    }
  }, []);

  useEffect(() => {
    tryFetchClusters();
    const t1 = setInterval(tryFetchClusters, 60_000);
    return () => clearInterval(t1);
  }, [tryFetchClusters]);

  useEffect(() => {
    tryFetchGeolocation();
    const t2 = setInterval(tryFetchGeolocation, 60_000);
    return () => clearInterval(t2);
  }, [tryFetchGeolocation]);

  const value = useMemo(
    () => ({
      clusters,
      geolocationEvents,
      events: PLACEHOLDER_EVENTS,
      drones: PLACEHOLDER_DRONES,
      zones: ZONES,
      boundaries: BOUNDARIES,
      ngoZones: NGO_ZONES,
      routes: ROUTES,
      lastUpdated,
      isLive,
    }),
    [clusters, geolocationEvents, lastUpdated, isLive]
  );

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
