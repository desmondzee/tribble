"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useUIStore } from "@/store/uiSlice";
import { useLayerStore } from "@/store/layerSlice";
import { AnimatePresence } from "framer-motion";
import { IncidentTooltip } from "@/components/map/IncidentTooltip";
import { fetchGeolocationGeoJSON } from "@/lib/geolocation-api";
import {
  PLACEHOLDER_EVENTS,
  PLACEHOLDER_DRONES,
  PLACEHOLDER_ZONES,
  PLACEHOLDER_BOUNDARIES,
  PLACEHOLDER_NGOS,
} from "@/lib/placeholder-data";
import { CONFLICT_ZONES } from "@/lib/conflict-zones";
import { WORLD_CITIES } from "@/lib/cities-data";
import { ONTOLOGY_TO_LAYER } from "@/lib/icon-registry";
import type { Incident } from "@/types";

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: "HIP Dark",
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
      maxzoom: 19,
    },
    "labels-en": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#101828" },
    },
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm-tiles",
      paint: {
        "raster-opacity": 1,
        "raster-brightness-max": 1,
        "raster-brightness-min": 0.15,
        "raster-contrast": 0.05,
        "raster-saturation": -0.2,
      },
    },
    {
      id: "labels-en",
      type: "raster",
      source: "labels-en",
      paint: { "raster-opacity": 0.85 },
    },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

function buildEventsGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: PLACEHOLDER_EVENTS.map((e) => ({
      type: "Feature" as const,
      properties: {
        id: e.id,
        severity: e.severity,
        ontology_class: e.ontology_class,
        source_type: e.source_type,
        confidence: e.confidence_score,
        verification: e.verification_status,
        description: e.description,
        location_name: e.location_name,
        timestamp: e.timestamp,
        layerGroup: ONTOLOGY_TO_LAYER[e.ontology_class] || "C1",
      },
      geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
    })),
  };
}

function buildDronesGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: PLACEHOLDER_DRONES.map((d) => ({
      type: "Feature" as const,
      properties: {
        id: d.id,
        status: d.status,
        heading: d.position.heading_deg,
        battery: d.battery_pct,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [d.position.lng, d.position.lat],
      },
    })),
  };
}

function buildZonesGeoJSON(): GeoJSON.FeatureCollection {
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
      geometry: z.geojson.geometry,
    })),
  };
}

function buildBoundariesGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: PLACEHOLDER_BOUNDARIES.map((b) => ({
      type: "Feature" as const,
      properties: {
        id: b.id,
        boundary_type: b.boundary_type,
        name: b.name,
      },
      geometry: b.geojson.geometry,
    })),
  };
}

function buildRoutesGeoJSON(zoneId: string | null): GeoJSON.FeatureCollection {
  if (!zoneId)
    return { type: "FeatureCollection", features: [] };
  const zone = CONFLICT_ZONES.find((z) => z.id === zoneId);
  if (!zone) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: zone.routes.map((r) => ({
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
      },
    })),
  };
}

function buildNGOZonesGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: PLACEHOLDER_NGOS.filter((n) => n.zone_geojson).map((n) => ({
      type: "Feature" as const,
      properties: {
        id: n.id,
        name: n.abbreviation,
        colour: n.colour,
      },
      geometry: n.zone_geojson!.geometry,
    })),
  };
}

function buildCitiesGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: WORLD_CITIES.map((c) => ({
      type: "Feature" as const,
      properties: {
        name: c.name,
        rank: c.rank,
        capital: c.capital || false,
      },
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
    })),
  };
}

export const SimulatedMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const {
    setSelectedEventId,
    setRightPanelOpen,
    setRightPanelTab,
    activeConflictZoneId,
  } = useUIStore();
  const { visibility } = useLayerStore();
  const [hoveredIncident, setHoveredIncident] = useState<{
    incident: Incident;
    x: number;
    y: number;
  } | null>(null);
  const prevZoneId = useRef<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const styleWithGlobe = { ...DARK_STYLE, projection: { type: "globe" as const } };
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleWithGlobe,
      center: [30, 15],
      zoom: 3.5,
      minZoom: 1,
      maxZoom: 18,
      attributionControl: false,
      antialias: true,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

    map.on("load", () => {
      map.addSource("events", { type: "geojson", data: buildEventsGeoJSON() });
      map.addSource("drones", { type: "geojson", data: buildDronesGeoJSON() });
      map.addSource("zones", { type: "geojson", data: buildZonesGeoJSON() });
      map.addSource(
        "boundaries",
        { type: "geojson", data: buildBoundariesGeoJSON() }
      );
      map.addSource("routes", {
        type: "geojson",
        data: buildRoutesGeoJSON(null),
      });
      map.addSource("ngo-zones", {
        type: "geojson",
        data: buildNGOZonesGeoJSON(),
      });
      map.addSource("cities", { type: "geojson", data: buildCitiesGeoJSON() });
      map.addSource("geolocation", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        paint: {
          "fill-color": [
            "match",
            ["get", "zone_type"],
            "no_go_zone",
            "rgba(255, 45, 85, 0.12)",
            "conflict_zone",
            "rgba(255, 107, 53, 0.08)",
            "contested_territory",
            "rgba(123, 97, 255, 0.08)",
            "safe_zone",
            "rgba(0, 255, 136, 0.08)",
            "controlled_territory",
            "rgba(123, 97, 255, 0.06)",
            "displacement_corridor",
            "rgba(123, 97, 255, 0.06)",
            "transparent",
          ],
          "fill-opacity": 0.8,
        },
      });

      map.addLayer({
        id: "zones-outline",
        type: "line",
        source: "zones",
        paint: {
          "line-color": [
            "match",
            ["get", "zone_type"],
            "no_go_zone",
            "#FF2D55",
            "conflict_zone",
            "#FF6B35",
            "contested_territory",
            "#7B61FF",
            "safe_zone",
            "#00FF88",
            "controlled_territory",
            "#7B61FF",
            "displacement_corridor",
            "#7B61FF",
            "#1E2D4A",
          ],
          "line-width": 1.5,
          "line-dasharray": [4, 3],
        },
      });

      map.addLayer({
        id: "zones-labels",
        type: "symbol",
        source: "zones",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 10,
          "text-font": ["Open Sans Regular"],
          "text-anchor": "center",
        },
        paint: {
          "text-color": "#E8EDF5",
          "text-opacity": 0.6,
          "text-halo-color": "#0A0E1A",
          "text-halo-width": 1,
        },
        minzoom: 4,
      });

      map.addLayer({
        id: "boundaries-line",
        type: "line",
        source: "boundaries",
        paint: {
          "line-color": [
            "match",
            ["get", "boundary_type"],
            "international_border",
            "#E8EDF5",
            "disputed_border",
            "#FF6B35",
            "ceasefire_line",
            "#7B61FF",
            "frontline_active",
            "#FF2D55",
            "administrative_boundary",
            "#8892A4",
            "#1E2D4A",
          ],
          "line-width": [
            "match",
            ["get", "boundary_type"],
            "frontline_active",
            2,
            "disputed_border",
            1.2,
            "ceasefire_line",
            1,
            0.6,
          ],
          "line-opacity": [
            "match",
            ["get", "boundary_type"],
            "international_border",
            0.4,
            "administrative_boundary",
            0.3,
            0.8,
          ],
          "line-dasharray": [4, 3],
        },
      });

      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        paint: {
          "line-color": [
            "match",
            ["get", "status"],
            "open",
            "#00FF88",
            "contested",
            "#FF6B35",
            "blocked",
            "#FF9500",
            "destroyed",
            "#FF2D55",
            "#636366",
          ],
          "line-width": ["match", ["get", "routeType"], "highway", 3, 2],
          "line-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "routes-labels",
        type: "symbol",
        source: "routes",
        layout: {
          "symbol-placement": "line-center",
          "text-field": [
            "concat",
            ["get", "name"],
            " — ",
            ["upcase", ["get", "status"]],
          ],
          "text-size": 9,
          "text-font": ["Open Sans Regular"],
          "text-anchor": "center",
          "text-offset": [0, -0.8],
        },
        paint: {
          "text-color": [
            "match",
            ["get", "status"],
            "open",
            "#00FF88",
            "contested",
            "#FF6B35",
            "blocked",
            "#FF9500",
            "destroyed",
            "#FF2D55",
            "#636366",
          ],
          "text-halo-color": "#0A0E1A",
          "text-halo-width": 1.5,
          "text-opacity": 0.9,
        },
        minzoom: 5,
      });

      map.addLayer({
        id: "ngo-zones-outline",
        type: "line",
        source: "ngo-zones",
        paint: {
          "line-color": ["get", "colour"],
          "line-width": 1.5,
          "line-dasharray": [8, 4],
          "line-opacity": 0.5,
        },
        minzoom: 5,
      });

      map.addLayer({
        id: "ngo-zones-labels",
        type: "symbol",
        source: "ngo-zones",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["Open Sans Regular"],
        },
        paint: {
          "text-color": ["get", "colour"],
          "text-opacity": 0.6,
          "text-halo-color": "#0A0E1A",
          "text-halo-width": 1,
        },
        minzoom: 5,
      });

      map.addLayer({
        id: "events-heat",
        type: "heatmap",
        source: "events",
        paint: {
          "heatmap-weight": ["get", "confidence"],
          "heatmap-intensity": 0.6,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0, 212, 255, 0)",
            0.2,
            "rgba(0, 212, 255, 0.15)",
            0.5,
            "rgba(255, 149, 0, 0.3)",
            0.8,
            "rgba(255, 45, 85, 0.5)",
            1,
            "rgba(255, 45, 85, 0.7)",
          ],
          "heatmap-radius": 30,
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            0.6,
            6,
            0.2,
            8,
            0,
          ],
        },
      });

      map.addLayer({
        id: "events-circles",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": [
            "match",
            ["get", "severity"],
            "critical",
            "#FF2D55",
            "high",
            "#FF9500",
            "medium",
            "#FFCC00",
            "low",
            "#636366",
            "#636366",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            ["match", ["get", "severity"], "critical", 5, "high", 4, 3],
            6,
            ["match", ["get", "severity"], "critical", 8, "high", 6, 5],
            12,
            ["match", ["get", "severity"], "critical", 12, "high", 10, 8],
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": [
            "match",
            ["get", "severity"],
            "critical",
            "#FF2D55",
            "high",
            "#FF9500",
            "medium",
            "#FFCC00",
            "low",
            "#636366",
            "#636366",
          ],
          "circle-opacity": [
            "match",
            ["get", "verification"],
            "unverified",
            0.5,
            "pending",
            0.7,
            1,
          ],
        },
        minzoom: 2,
      });

      map.addLayer({
        id: "geolocation-circles",
        type: "circle",
        source: "geolocation",
        paint: {
          "circle-color": [
            "case",
            ["get", "needs_human_review"],
            "rgba(255, 149, 0, 0.9)",
            "#00D4FF",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            2,
            4,
            6,
            6,
            12,
            8,
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#00D4FF",
          "circle-opacity": [
            "case",
            ["get", "needs_human_review"],
            0.7,
            0.9,
          ],
        },
        minzoom: 2,
      });

      fetchGeolocationGeoJSON(50)
        .then((data) => {
          const src = map.getSource("geolocation") as
            | maplibregl.GeoJSONSource
            | undefined;
          if (src) src.setData(data as GeoJSON.FeatureCollection);
        })
        .catch(() => {});

      map.addLayer({
        id: "events-labels",
        type: "symbol",
        source: "events",
        layout: {
          "text-field": ["get", "id"],
          "text-size": 9,
          "text-font": ["Open Sans Regular"],
          "text-offset": [1.2, 0],
          "text-anchor": "left",
        },
        paint: {
          "text-color": "#E8EDF5",
          "text-opacity": 0.8,
          "text-halo-color": "#0A0E1A",
          "text-halo-width": 1,
        },
        minzoom: 6,
      });

      map.addLayer({
        id: "drones-circles",
        type: "circle",
        source: "drones",
        paint: {
          "circle-color": [
            "match",
            ["get", "status"],
            "active",
            "#00D4FF",
            "standby",
            "#636366",
            "low_battery",
            "#FF6B35",
            "lost_signal",
            "#FF2D55",
            "#636366",
          ],
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": [
            "match",
            ["get", "status"],
            "active",
            "#00D4FF",
            "standby",
            "#636366",
            "low_battery",
            "#FF6B35",
            "lost_signal",
            "#FF2D55",
            "#636366",
          ],
          "circle-stroke-opacity": 0.5,
        },
        minzoom: 3,
      });

      map.addLayer({
        id: "drones-labels",
        type: "symbol",
        source: "drones",
        layout: {
          "text-field": ["get", "id"],
          "text-size": 9,
          "text-font": ["Open Sans Regular"],
          "text-offset": [1.5, 0],
          "text-anchor": "left",
        },
        paint: {
          "text-color": "#00D4FF",
          "text-opacity": 0.8,
          "text-halo-color": "#0A0E1A",
          "text-halo-width": 1,
        },
        minzoom: 4,
      });

      map.on("click", "events-circles", (e) => {
        const feature = e.features?.[0];
        if (feature?.properties?.id) {
          setSelectedEventId(feature.properties.id as string);
          setRightPanelTab("agent");
          setRightPanelOpen(true);
        }
      });

      map.on("mouseenter", "events-circles", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (feature) {
          const coords = (feature.geometry as GeoJSON.Point).coordinates;
          const point = map.project(coords as [number, number]);
          const evt = PLACEHOLDER_EVENTS.find(
            (ev) => ev.id === feature.properties?.id
          );
          if (evt) {
            const incident: Incident = {
              id: evt.id,
              type: evt.ontology_class as Incident["type"],
              severity: evt.severity,
              lat: evt.lat,
              lng: evt.lng,
              location_name: evt.location_name,
              timestamp: evt.timestamp,
              description: evt.description,
              verification_status:
                evt.verification_status as Incident["verification_status"],
              risk_score: Math.round(evt.confidence_score * 100),
              assigned_ngo_ids: evt.assigned_ngo_ids || [],
              related_incident_ids: [],
            };
            setHoveredIncident({ incident, x: point.x, y: point.y });
          }
        }
      });

      map.on("mouseleave", "events-circles", () => {
        map.getCanvas().style.cursor = "";
        setHoveredIncident(null);
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { lng, lat, zoom } = (e as CustomEvent).detail;
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom,
        duration: 1500,
        essential: true,
      });
    };
    window.addEventListener("hip:flyTo", handler);
    return () => window.removeEventListener("hip:flyTo", handler);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (activeConflictZoneId !== prevZoneId.current) {
      prevZoneId.current = activeConflictZoneId;
      const src = map.getSource("routes") as maplibregl.GeoJSONSource;
      if (src) {
        src.setData(buildRoutesGeoJSON(activeConflictZoneId));
      }
    }
  }, [activeConflictZoneId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const layerMapping: Record<string, string[]> = {
      "zones-fill": [
        "B3_safe_zones",
        "B4_no_go_zones",
        "A5_controlled_territory",
      ],
      "zones-outline": [
        "B3_safe_zones",
        "B4_no_go_zones",
        "A5_controlled_territory",
      ],
      "zones-labels": ["B3_safe_zones", "B4_no_go_zones"],
      "boundaries-line": [
        "A1_intl_borders",
        "A2_disputed_borders",
        "A4_frontlines",
      ],
      "events-heat": ["D1_risk_heatmap"],
      "events-circles": [
        "C1_armed_conflict",
        "C2_infrastructure",
        "C3_displacement",
        "C4_aid_humanitarian",
        "C5_natural_environmental",
      ],
      "events-labels": ["C1_armed_conflict"],
      "drones-circles": ["E1_drones"],
      "drones-labels": ["E1_drones"],
      "ngo-zones-outline": ["B1_humanitarian_ops"],
      "ngo-zones-labels": ["B1_humanitarian_ops"],
      "routes-line": ["E2_supply_routes"],
      "routes-labels": ["E2_supply_routes"],
    };

    for (const [mlLayerId, vizKeys] of Object.entries(layerMapping)) {
      if (!map.getLayer(mlLayerId)) continue;
      const anyVisible = vizKeys.some(
        (k) => visibility[k as keyof typeof visibility]
      );
      map.setLayoutProperty(
        mlLayerId,
        "visibility",
        anyVisible ? "visible" : "none"
      );
    }
  }, [visibility]);

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />

      <div className="absolute bottom-4 left-[300px] z-10 pointer-events-none select-none">
        <p className="font-mono text-[10px] text-muted-foreground">
          MapLibre GL
        </p>
      </div>

      <AnimatePresence>
        {hoveredIncident && (
          <IncidentTooltip
            incident={hoveredIncident.incident}
            x={hoveredIncident.x}
            y={hoveredIncident.y}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
