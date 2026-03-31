"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { getClusters, getNewsEvents, getReliefRuns, type GeoJSONFeatureCollection, type NewsEvent } from "@/lib/api";
import { fetchGeolocationGeoJSON } from "@/lib/geolocation-api";
import { MOCK_CLUSTERS } from "@/data/mapData";
import { getPlaceholderFeedNews } from "@/lib/feed-placeholder";
import {
  PLACEHOLDER_EVENTS,
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

const NEWEST_EVENTS_COUNT = 10;

function parseTimestamp(ts: string | null): number {
  if (ts == null) return 0;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? 0 : t;
}

const DataContext = createContext<{
  clusters: GeoJSONFeatureCollection;
  geolocationEvents: GeoJSONFC;
  newsEvents: NewsEvent[];
  newestEventIds: Set<string>;
  events: typeof PLACEHOLDER_EVENTS;
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
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>(() => getPlaceholderFeedNews());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [reliefRunsGeoJSON, setReliefRunsGeoJSON] = useState<GeoJSONFC | null>(null);

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

  const tryFetchNews = useCallback(async () => {
    try {
      const items = await getNewsEvents({ limit: 50, country_iso: "SSD" });
      setNewsEvents(items.length > 0 ? items : getPlaceholderFeedNews());
    } catch {
      setNewsEvents(getPlaceholderFeedNews());
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

  const tryFetchReliefRuns = useCallback(async () => {
    try {
      const data = await getReliefRuns({ country_iso: "SSD", limit: 200 });
      setReliefRunsGeoJSON({
        type: "FeatureCollection",
        features: data.features as GeoJSONFC["features"],
      });
    } catch {
      setReliefRunsGeoJSON(null);
    }
  }, []);

  useEffect(() => {
    tryFetchClusters();
    const t1 = setInterval(tryFetchClusters, 60_000);
    return () => clearInterval(t1);
  }, [tryFetchClusters]);

  useEffect(() => {
    tryFetchNews();
    const tN = setInterval(tryFetchNews, 60_000);
    return () => clearInterval(tN);
  }, [tryFetchNews]);

  useEffect(() => {
    tryFetchGeolocation();
    const t2 = setInterval(tryFetchGeolocation, 60_000);
    return () => clearInterval(t2);
  }, [tryFetchGeolocation]);

  useEffect(() => {
    tryFetchReliefRuns();
    const tRelief = setInterval(tryFetchReliefRuns, 60_000);
    return () => clearInterval(tRelief);
  }, [tryFetchReliefRuns]);

  const newestEventIds = useMemo(() => {
    const sorted = [...newsEvents].sort(
      (a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp)
    );
    return new Set(sorted.slice(0, NEWEST_EVENTS_COUNT).map((e) => e.id));
  }, [newsEvents]);

  const routes = useMemo((): GeoJSONFC => {
    const staticFeatures = ROUTES.features;
    const reliefFeatures = reliefRunsGeoJSON?.features ?? [];
    return {
      type: "FeatureCollection",
      features: [...staticFeatures, ...reliefFeatures],
    };
  }, [reliefRunsGeoJSON]);

  const value = useMemo(
    () => ({
      clusters,
      geolocationEvents,
      newsEvents,
      newestEventIds,
      events: PLACEHOLDER_EVENTS,
      zones: ZONES,
      boundaries: BOUNDARIES,
      ngoZones: NGO_ZONES,
      routes,
      lastUpdated,
      isLive,
    }),
    [clusters, geolocationEvents, newsEvents, newestEventIds, routes, lastUpdated, isLive]
  );

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
