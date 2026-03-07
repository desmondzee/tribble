"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import Map, {
  Marker,
  Source,
  Layer,
  NavigationControl,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "@/styles/map.css";
import ClusterMarker from "./ClusterMarker";
import {
  buildCoverageGeoJSON,
  buildSeverityZoneGeoJSON,
  featureToCluster,
} from "@/data/mapData";
import { useData } from "@/context/DataContext";

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
];

const DEFAULT_VIEW = { longitude: 0, latitude: 20, zoom: 2 };

export default function TacticalMap() {
  const { clusters } = useData();

  const [layers, setLayers] = useState({
    clusters: true,
    coverage: true,
    severityZones: true,
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
    (key: "clusters" | "coverage" | "severityZones") =>
      setLayers((prev) => ({ ...prev, [key]: !prev[key] })),
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
              onClick={() => toggleLayer(key as "clusters" | "coverage" | "severityZones")}
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
