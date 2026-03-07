"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { Map as MapboxMap, FillLayer, LineLayer } from "mapbox-gl";
import Map, {
  Marker,
  Source,
  Layer,
  NavigationControl,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "@/styles/map.css";
import ClusterMarker from "./ClusterMarker";
import { EventMarker } from "./EventMarker";
import { DroneMarker } from "./DroneMarker";
import {
  buildCoverageGeoJSON,
  buildSeverityZoneGeoJSON,
  featureToCluster,
} from "@/data/mapData";
import { useData } from "@/context/DataContext";
import { useUIStore } from "@/store/uiSlice";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const isTokenValid =
  TOKEN && typeof TOKEN === "string" && TOKEN.startsWith("pk.");

const MAP_STYLES = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  "3d": "mapbox://styles/mapbox/standard",
};

// ── Layer style definitions (mirror zerostrike exactly) ─────────────────
const COVER_FILL = {
  id: "cover-fill",
  type: "fill" as const,
  paint: { "fill-color": "#38bdf8", "fill-opacity": 0.08 },
};
const COVER_LINE = {
  id: "cover-line",
  type: "line" as const,
  paint: {
    "line-color": "#38bdf8",
    "line-width": 1,
    "line-opacity": 0.4,
    "line-dasharray": [4, 2],
  },
};
const THREAT_FILL = {
  id: "threat-fill",
  type: "fill" as const,
  paint: {
    "fill-color": ["get", "color"] as [string, string],
    "fill-opacity": 0.15,
  },
};
const THREAT_LINE = {
  id: "threat-line",
  type: "line" as const,
  paint: {
    "line-color": ["get", "color"] as [string, string],
    "line-width": 2,
    "line-opacity": 0.8,
  },
};

const LAYER_META = [
  { key: "clusters", label: "CLUSTERS" },
  { key: "coverage", label: "COVERAGE" },
  { key: "severityZones", label: "SEVERITY ZONES" },
  { key: "zones", label: "ZONES" },
  { key: "boundaries", label: "BOUNDARIES" },
  { key: "events", label: "EVENTS" },
  { key: "drones", label: "DRONES" },
  { key: "ngoZones", label: "NGO ZONES" },
  { key: "routes", label: "ROUTES" },
  { key: "geolocation", label: "GEOLOCATION" },
] as const;

type LayerKey = (typeof LAYER_META)[number]["key"];

const ZONES_FILL_PAINT = {
  "fill-color": [
    "match",
    ["get", "zone_type"],
    "no_go_zone", "rgba(255, 45, 85, 0.12)",
    "conflict_zone", "rgba(255, 107, 53, 0.08)",
    "contested_territory", "rgba(123, 97, 255, 0.08)",
    "safe_zone", "rgba(0, 255, 136, 0.08)",
    "transparent",
  ],
  "fill-opacity": 0.8,
};
const ZONES_LINE_PAINT = {
  "line-color": [
    "match",
    ["get", "zone_type"],
    "no_go_zone", "#FF2D55",
    "conflict_zone", "#FF6B35",
    "contested_territory", "#7B61FF",
    "safe_zone", "#00FF88",
    "#1E2D4A",
  ],
  "line-width": 1.5,
  "line-dasharray": [4, 3],
};
const BOUNDARIES_LINE_PAINT = {
  "line-color": [
    "match",
    ["get", "boundary_type"],
    "international_border", "#E8EDF5",
    "disputed_border", "#FF6B35",
    "frontline_active", "#FF2D55",
    "#1E2D4A",
  ],
  "line-width": 1.5,
  "line-opacity": 0.8,
  "line-dasharray": [4, 3],
};

const DEFAULT_VIEW = { longitude: 30, latitude: 15, zoom: 4 };

export default function LiveMap() {
  const { clusters, zones, boundaries, events, drones, ngoZones, routes, geolocationEvents } = useData();
  const { setSelectedEventId, setRightPanelOpen, setRightPanelTab } = useUIStore();

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    clusters: true,
    coverage: true,
    severityZones: true,
    zones: true,
    boundaries: true,
    events: true,
    drones: true,
    ngoZones: true,
    routes: true,
    geolocation: true,
  });
  const [viewState, setViewState] = useState({
    ...DEFAULT_VIEW,
    pitch: 0,
    bearing: 0,
  });
  const [mapMode, setMapMode] = useState<"satellite" | "3d">("satellite");
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<MapboxMap | null>(null);

  const flatClusters = useMemo(
    () => clusters.features.map(featureToCluster),
    [clusters]
  );
  const coverageGeoJSON = useMemo(
    () => buildCoverageGeoJSON(flatClusters),
    [flatClusters]
  );
  const severityZoneGeoJSON = useMemo(
    () => buildSeverityZoneGeoJSON(flatClusters),
    [flatClusters]
  );

  const toggleLayer = useCallback(
    (key: LayerKey) => setLayers((prev) => ({ ...prev, [key]: !prev[key] })),
    []
  );

  const switchMapMode = useCallback((mode: "satellite" | "3d") => {
    setMapLoaded(false);
    setMapMode(mode);
    setViewState((prev) => ({
      ...prev,
      pitch: mode === "3d" ? 60 : 0,
      bearing: mode === "3d" ? prev.bearing : 0,
    }));
  }, []);

  const resetToWorldView = useCallback(() => {
    setMapMode("satellite");
    setViewState({ ...DEFAULT_VIEW, pitch: 0, bearing: 0 });
  }, []);

  const handleMapLoad = useCallback((evt: { target: MapboxMap }) => {
    mapRef.current = evt.target;
    setMapLoaded(true);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const onMoveEnd = () => {
      const c = map.getCenter();
      setViewState((prev) => ({
        ...prev,
        longitude: c.lng,
        latitude: c.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      }));
    };
    map.on("moveend", onMoveEnd);
    return () => {
      void map.off("moveend", onMoveEnd);
    };
  }, [mapLoaded]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { lng, lat, zoom } = (e as CustomEvent<{ lng: number; lat: number; zoom: number }>).detail;
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom,
        duration: 1500,
        essential: true,
      });
      setViewState((prev) => ({ ...prev, longitude: lng, latitude: lat, zoom }));
    };
    window.addEventListener("hip:flyTo", handler);
    return () => window.removeEventListener("hip:flyTo", handler);
  }, []);

  if (!isTokenValid) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "#0b1121",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1rem",
          padding: "2rem",
          color: "#94a3b8",
          fontFamily: "monospace",
          fontSize: "0.9rem",
        }}
      >
        <div style={{ color: "#f87171", fontWeight: 600 }}>
          Mapbox: Invalid or missing token
        </div>
        <p
          style={{
            maxWidth: "32rem",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Set{" "}
          <code
            style={{
              background: "#1e293b",
              padding: "0.2rem 0.4rem",
              borderRadius: 4,
            }}
          >
            NEXT_PUBLIC_MAPBOX_TOKEN
          </code>{" "}
          in your <code>.env.local</code> to a{" "}
          <strong>public</strong> Mapbox token (<code>pk.*</code>). Get one at{" "}
          <a
            href="https://account.mapbox.com/access-tokens/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#38bdf8" }}
          >
            account.mapbox.com
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#0b1121",
      }}
    >
      <Map
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        onLoad={handleMapLoad}
        mapboxAccessToken={TOKEN}
        mapStyle={MAP_STYLES[mapMode]}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {mapLoaded && layers.coverage && (
          <Source id="coverage" type="geojson" data={coverageGeoJSON}>
            <Layer {...COVER_FILL} />
            <Layer {...COVER_LINE} />
          </Source>
        )}
        {mapLoaded && layers.severityZones && (
          <Source id="severity-zones" type="geojson" data={severityZoneGeoJSON}>
            <Layer {...THREAT_FILL} />
            <Layer {...THREAT_LINE} />
          </Source>
        )}

        {mapLoaded && layers.zones && zones.features.length > 0 && (
          <Source id="zones" type="geojson" data={zones as GeoJSON.FeatureCollection}>
            <Layer id="zones-fill" type="fill" paint={ZONES_FILL_PAINT as FillLayer["paint"]} />
            <Layer id="zones-line" type="line" paint={ZONES_LINE_PAINT as LineLayer["paint"]} />
          </Source>
        )}
        {mapLoaded && layers.boundaries && boundaries.features.length > 0 && (
          <Source id="boundaries" type="geojson" data={boundaries as GeoJSON.FeatureCollection}>
            <Layer id="boundaries-line" type="line" paint={BOUNDARIES_LINE_PAINT as LineLayer["paint"]} />
          </Source>
        )}
        {mapLoaded && layers.ngoZones && ngoZones.features.length > 0 && (
          <Source id="ngo-zones" type="geojson" data={ngoZones as GeoJSON.FeatureCollection}>
            <Layer
              id="ngo-zones-fill"
              type="fill"
              paint={{
                "fill-color": ["get", "colour"],
                "fill-opacity": 0.12,
              }}
            />
          </Source>
        )}
        {mapLoaded && layers.routes && routes.features.length > 0 && (
          <Source id="routes" type="geojson" data={routes as GeoJSON.FeatureCollection}>
            <Layer
              id="routes-line"
              type="line"
              paint={{
                "line-color": "#38bdf8",
                "line-width": 2,
                "line-opacity": 0.7,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
        )}
        {mapLoaded && layers.geolocation && geolocationEvents.features.length > 0 && (
          <Source id="geolocation" type="geojson" data={geolocationEvents as GeoJSON.FeatureCollection}>
            <Layer
              id="geolocation-circles"
              type="circle"
              paint={{
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["coalesce", ["get", "confidence_score"], 0.5],
                  0.5,
                  6,
                  1,
                  12,
                ],
                "circle-color": [
                  "case",
                  ["coalesce", ["get", "needs_human_review"], false],
                  "#f97316",
                  "#00ff88",
                ],
                "circle-opacity": 0.8,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#fff",
              }}
            />
          </Source>
        )}

        {layers.events &&
          events.map((evt) => (
            <Marker key={evt.id} longitude={evt.lng} latitude={evt.lat} anchor="center">
              <EventMarker
                event={evt}
                onClick={() => {
                  setSelectedEventId(evt.id);
                  setRightPanelOpen(true);
                  setRightPanelTab("news_feed");
                }}
              />
            </Marker>
          ))}
        {layers.drones &&
          drones.map((d) => (
            <Marker
              key={d.id}
              longitude={d.position.lng}
              latitude={d.position.lat}
              anchor="center"
            >
              <DroneMarker drone={d} />
            </Marker>
          ))}

        {layers.clusters &&
          clusters.features.map((f) => {
            const [lng, lat] = f.geometry.coordinates;
            return (
              <Marker key={f.properties?.id ?? String(lng + lat)} longitude={lng} latitude={lat} anchor="center">
                <ClusterMarker
                  cluster={{
                    id: f.properties?.id,
                    report_count: f.properties?.report_count,
                    weighted_severity: f.properties?.weighted_severity,
                    top_need_categories: f.properties?.top_need_categories,
                  }}
                />
              </Marker>
            );
          })}
      </Map>

      <div className="map-hud-overlay">
        <div className="map-hud-coords map-hud-panel">
          <div className="map-hud-row">
            <span className="map-hud-label">LAT</span>
            <span className="map-hud-value">
              {viewState.latitude.toFixed(4)}°
            </span>
          </div>
          <div className="map-hud-row">
            <span className="map-hud-label">LON</span>
            <span className="map-hud-value">
              {viewState.longitude.toFixed(4)}°
            </span>
          </div>
          <div className="map-hud-row">
            <span className="map-hud-label">ZOOM</span>
            <span className="map-hud-value">{viewState.zoom.toFixed(1)}</span>
          </div>
        </div>

        <div className="map-mode-controls map-hud-panel">
          <div className="map-layer-header">MODE</div>
          <button
            className={`map-layer-btn ${mapMode === "satellite" ? "active" : ""}`}
            onClick={() => switchMapMode("satellite")}
          >
            <span className="map-layer-dot satellites" />
            SATELLITE
          </button>
          <button
            className={`map-layer-btn ${mapMode === "3d" ? "active" : ""}`}
            onClick={() => switchMapMode("3d")}
          >
            <span className="map-layer-dot threed" />
            3D
          </button>
          {mapMode === "3d" && (
            <button className="map-layer-btn" onClick={resetToWorldView}>
              <span className="map-layer-dot reset" />
              RESET VIEW
            </button>
          )}
        </div>

        <div className="map-layer-controls map-hud-panel">
          <div className="map-layer-header">LAYERS</div>
          {LAYER_META.map(({ key, label }) => (
            <button
              key={key}
              className={`map-layer-btn ${layers[key as keyof typeof layers] ? "active" : ""}`}
              onClick={() => toggleLayer(key)}
            >
              <span className={`map-layer-dot ${key}`} />
              {label}
            </button>
          ))}
        </div>

        <div className="map-hud-meta">
          <div>PROJ: MERCATOR</div>
          <div>DATUM: WGS84</div>
          <div className="highlight">
            {clusters.features.length} CLUSTERS
          </div>
        </div>
      </div>
    </div>
  );
}
