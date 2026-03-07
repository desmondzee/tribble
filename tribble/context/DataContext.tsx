"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
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
import {
  fetchEvents as sbFetchEvents,
  fetchDrones as sbFetchDrones,
  fetchZones as sbFetchZones,
  fetchBoundaries as sbFetchBoundaries,
  fetchNGOs as sbFetchNGOs,
} from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/client";
import type { HipEvent, Drone, NGO } from "@/types";
import type { DbZone, DbBoundary } from "@/lib/supabase/types";

export interface GeoJSONFC {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties?: Record<string, unknown>;
  }>;
}

function buildZonesGeoJSON(
  zones?: DbZone[]
): GeoJSONFC {
  if (zones && zones.length > 0) {
    return {
      type: "FeatureCollection",
      features: zones.map((z) => ({
        type: "Feature" as const,
        properties: {
          id: z.id,
          zone_type: z.zone_type,
          name: z.name,
          risk_score: z.risk_score,
        },
        geometry: (z.geojson as GeoJSON.Feature).geometry as GeoJSON.Geometry,
      })),
    };
  }
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

function buildBoundariesGeoJSON(
  boundaries?: DbBoundary[]
): GeoJSONFC {
  if (boundaries && boundaries.length > 0) {
    return {
      type: "FeatureCollection",
      features: boundaries.map((b) => ({
        type: "Feature" as const,
        properties: {
          id: b.id,
          boundary_type: b.boundary_type,
          name: b.name,
        },
        geometry: (b.geojson as GeoJSON.Feature).geometry as GeoJSON.Geometry,
      })),
    };
  }
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

function buildNGOZonesGeoJSON(ngos?: NGO[]): GeoJSONFC {
  const src = ngos && ngos.length > 0 ? ngos : PLACEHOLDER_NGOS;
  return {
    type: "FeatureCollection",
    features: src
      .filter((n) => n.zone_geojson)
      .map((n) => ({
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
  events: HipEvent[];
  drones: Drone[];
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

  // Supabase-backed state (falls back to placeholders)
  const [events, setEvents] = useState<HipEvent[]>(PLACEHOLDER_EVENTS);
  const [drones, setDrones] = useState<Drone[]>(PLACEHOLDER_DRONES);
  const [dbZones, setDbZones] = useState<DbZone[]>([]);
  const [dbBoundaries, setDbBoundaries] = useState<DbBoundary[]>([]);
  const [ngos, setNgos] = useState<NGO[]>([]);

  // Derived GeoJSON from DB or placeholder data
  const zones = useMemo(() => buildZonesGeoJSON(dbZones), [dbZones]);
  const boundaries = useMemo(
    () => buildBoundariesGeoJSON(dbBoundaries),
    [dbBoundaries]
  );
  const ngoZones = useMemo(() => buildNGOZonesGeoJSON(ngos), [ngos]);

  // Fetch Supabase data on mount
  const hasFetchedSupabase = useRef(false);
  useEffect(() => {
    if (hasFetchedSupabase.current) return;
    hasFetchedSupabase.current = true;

    async function loadSupabaseData() {
      const [sbEvents, sbDrones, sbZonesData, sbBoundariesData, sbNgos] =
        await Promise.all([
          sbFetchEvents(),
          sbFetchDrones(),
          sbFetchZones(),
          sbFetchBoundaries(),
          sbFetchNGOs(),
        ]);

      if (sbEvents.length > 0) setEvents(sbEvents);
      if (sbDrones.length > 0) setDrones(sbDrones);
      if (sbZonesData.length > 0) setDbZones(sbZonesData);
      if (sbBoundariesData.length > 0) setDbBoundaries(sbBoundariesData);
      if (sbNgos.length > 0) setNgos(sbNgos);
    }

    loadSupabaseData();
  }, []);

  // Supabase realtime subscription for new events
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("events-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newEvent: HipEvent = {
            id: row.id as string,
            ontology_class: row.ontology_class as HipEvent["ontology_class"],
            severity: row.severity as HipEvent["severity"],
            lat: row.lat as number,
            lng: row.lng as number,
            region_id: (row.region_id as string) ?? "",
            location_name: row.location_name as string,
            timestamp: row.timestamp as string,
            description: row.description as string,
            source_type: row.source_type as HipEvent["source_type"],
            source_label: row.source_label as string,
            confidence_score: row.confidence_score as number,
            verification_status:
              row.verification_status as HipEvent["verification_status"],
            assigned_ngo_ids: (row.assigned_ngo_ids as string[]) ?? [],
            related_event_ids: (row.related_event_ids as string[]) ?? [],
            last_updated: row.last_updated as string,
          };
          setEvents((prev) => [newEvent, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
      events,
      drones,
      zones,
      boundaries,
      ngoZones,
      routes: ROUTES,
      lastUpdated,
      isLive,
    }),
    [
      clusters,
      geolocationEvents,
      events,
      drones,
      zones,
      boundaries,
      ngoZones,
      lastUpdated,
      isLive,
    ]
  );

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
