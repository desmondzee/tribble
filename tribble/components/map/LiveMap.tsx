"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, MessageSquare, Bot } from "lucide-react";
import type { Map as MapboxMap, FillLayer, LineLayer } from "mapbox-gl";
import Map, {
  Marker,
  Popup,
  Source,
  Layer,
  NavigationControl,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import "@/styles/map.css";
import ClusterMarker from "./ClusterMarker";
import { EventMarker } from "./EventMarker";
import {
  buildCoverageGeoJSON,
  buildSeverityZoneGeoJSON,
  featureToCluster,
} from "@/data/mapData";
import { useData } from "@/context/DataContext";
import { useUIStore } from "@/store/uiSlice";
import {
  getEventSatelliteResults,
  runEventSatelliteAnalysis,
  getSatellitePreviewUrl,
  type EventSatelliteResult,
  type NewsEvent,
} from "@/lib/api";
import type { HipEvent } from "@/types";

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
  { key: "ngoZones", label: "NGO ZONES" },
  { key: "routes", label: "ROUTES & RELIEF EN ROUTE" },
  { key: "geolocation", label: "GEOLOCATION" },
] as const;

const LEGEND_SEVERITY_ITEMS = [
  { label: "Critical", color: "hsl(var(--hip-critical))" },
  { label: "High", color: "hsl(var(--hip-warn))" },
  { label: "Medium", color: "hsl(var(--hip-medium))" },
  { label: "Low", color: "hsl(var(--hip-low))" },
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

const DEFAULT_VIEW = { longitude: 30.5, latitude: 7.0, zoom: 5.5 };

function timeSince(ts: string | null): string {
  if (!ts) return "—";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 0) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export default function LiveMap() {
  const { clusters, zones, boundaries, events, ngoZones, routes, geolocationEvents, newsEvents, newestEventIds } = useData();
  const {
    setSelectedEventId,
    setSelectedNewsEventId,
    setRightPanelOpen,
    setRightPanelTab,
    setSelectedClusterId,
    locationPickMode,
    setLocationPickMode,
    rightPanelOpen,
    selectedEventId,
    selectedNewsEventId,
  } = useUIStore();

  const [popupSatelliteResult, setPopupSatelliteResult] = useState<EventSatelliteResult | null>(null);
  const [popupSatelliteLoading, setPopupSatelliteLoading] = useState(false);
  const [popupAnalysisLoading, setPopupAnalysisLoading] = useState(false);
  const [popupSatelliteError, setPopupSatelliteError] = useState<string | null>(null);
  const [popupHeliosOverviewOpen, setPopupHeliosOverviewOpen] = useState(false);

  const popupEvent = useMemo((): (NewsEvent | HipEvent) | null => {
    if (selectedNewsEventId) {
      const ev = newsEvents.find((e) => e.id === selectedNewsEventId);
      if (ev && ev.lat != null && ev.lng != null) return ev;
    }
    if (selectedEventId) {
      return events.find((e) => e.id === selectedEventId) ?? null;
    }
    return null;
  }, [selectedNewsEventId, selectedEventId, newsEvents, events]);

  const popupLat = popupEvent == null ? null : "headline" in popupEvent ? (popupEvent as NewsEvent).lat ?? null : (popupEvent as HipEvent).lat;
  const popupLng = popupEvent == null ? null : "headline" in popupEvent ? (popupEvent as NewsEvent).lng ?? null : (popupEvent as HipEvent).lng;
  const popupHasCoords = popupLat != null && popupLng != null;
  const popupEventId = popupEvent?.id ?? null;

  useEffect(() => {
    if (!popupEventId || !popupHasCoords) {
      setPopupSatelliteResult(null);
      setPopupSatelliteError(null);
      setPopupHeliosOverviewOpen(false);
      return;
    }
    let cancelled = false;
    setPopupSatelliteError(null);
    setPopupSatelliteLoading(true);
    getEventSatelliteResults([popupEventId])
      .then((data) => {
        if (cancelled) return;
        const first = data.results.find((r) => r.event_id === popupEventId);
        setPopupSatelliteResult(first ?? null);
      })
      .catch((err) => {
        if (!cancelled) setPopupSatelliteError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setPopupSatelliteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [popupEventId, popupHasCoords]);

  const runPopupAnalysis = useCallback(async () => {
    if (!popupEvent || !popupHasCoords) return;
    setPopupSatelliteError(null);
    setPopupAnalysisLoading(true);
    try {
      const payload =
        "headline" in popupEvent
          ? {
              id: popupEvent.id,
              headline: popupEvent.headline,
              lat: (popupEvent as NewsEvent).lat,
              lng: (popupEvent as NewsEvent).lng,
              timestamp: (popupEvent as NewsEvent).timestamp ?? undefined,
            }
          : {
              id: popupEvent.id,
              headline: (popupEvent as HipEvent).description || (popupEvent as HipEvent).location_name,
              lat: (popupEvent as HipEvent).lat,
              lng: (popupEvent as HipEvent).lng,
              timestamp: (popupEvent as HipEvent).timestamp,
            };
      const data = await runEventSatelliteAnalysis([payload]);
      const first = data.results.find((r) => r.event_id === popupEvent.id) ?? data.results[0];
      if (first) setPopupSatelliteResult(first);
    } catch (err) {
      setPopupSatelliteError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setPopupAnalysisLoading(false);
    }
  }, [popupEvent, popupHasCoords]);

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    clusters: true,
    coverage: true,
    severityZones: true,
    zones: true,
    boundaries: true,
    events: true,
    ngoZones: true,
    routes: false,
    geolocation: true,
  });
  const [viewState, setViewState] = useState({
    ...DEFAULT_VIEW,
    pitch: 0,
    bearing: 0,
  });
  const [mapMode, setMapMode] = useState<"satellite" | "3d">("satellite");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
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
  const eventsCircleGeoJSON = useMemo((): GeoJSON.FeatureCollection => {
    const points: GeoJSON.Feature<GeoJSON.Point, { id: string; severity: string }>[] = [];
    events.forEach((evt) => {
      points.push({
        type: "Feature",
        properties: { id: evt.id, severity: evt.severity },
        geometry: { type: "Point", coordinates: [evt.lng, evt.lat] },
      });
    });
    newsEvents.forEach((evt) => {
      if (evt.lat != null && evt.lng != null) {
        points.push({
          type: "Feature",
          properties: { id: evt.id, severity: evt.severity },
          geometry: { type: "Point", coordinates: [evt.lng, evt.lat] },
        });
      }
    });
    return { type: "FeatureCollection", features: points };
  }, [events, newsEvents]);

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

  const handleMapClick = useCallback(
    (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number } }) => {
      if (locationPickMode) {
        window.dispatchEvent(
          new CustomEvent("hip:locationPicked", {
            detail: { lat: e.lngLat.lat, lng: e.lngLat.lng },
          })
        );
        setLocationPickMode(false);
        return;
      }
      const map = mapRef.current;
      if (!map || !layers.events) return;
      const features = map.queryRenderedFeatures([e.point.x, e.point.y], {
        layers: ["event-circles-layer"],
      });
      if (features.length === 0) return;
      const first = features[0];
      const id = first.properties?.id as string | undefined;
      if (!id) return;
      const placeholderEvent = events.find((ev) => ev.id === id);
      const newsEvent = newsEvents.find((ev) => ev.id === id);
      if (placeholderEvent) {
        setSelectedEventId(id);
        setSelectedNewsEventId(null);
        setRightPanelOpen(true);
        setRightPanelTab("news_feed");
        map.flyTo({
          center: [placeholderEvent.lng, placeholderEvent.lat],
          zoom: 9,
          duration: 800,
          essential: true,
        });
        setViewState((prev) => ({
          ...prev,
          longitude: placeholderEvent.lng,
          latitude: placeholderEvent.lat,
          zoom: 9,
        }));
      } else if (newsEvent && newsEvent.lat != null && newsEvent.lng != null) {
        setSelectedNewsEventId(id);
        setSelectedEventId(null);
        setRightPanelOpen(true);
        setRightPanelTab("news_feed");
        map.flyTo({
          center: [newsEvent.lng, newsEvent.lat],
          zoom: 9,
          duration: 800,
          essential: true,
        });
        setViewState((prev) => ({
          ...prev,
          longitude: newsEvent.lng!,
          latitude: newsEvent.lat!,
          zoom: 9,
        }));
      }
    },
    [
      locationPickMode,
      setLocationPickMode,
      layers.events,
      events,
      newsEvents,
      setSelectedEventId,
      setSelectedNewsEventId,
      setRightPanelOpen,
      setRightPanelTab,
    ]
  );

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
        onClick={(e) => {
          handleMapClick(e);
        }}
        mapboxAccessToken={TOKEN}
        mapStyle={MAP_STYLES[mapMode]}
        style={{ width: "100%", height: "100%" }}
        cursor={locationPickMode ? "crosshair" : undefined}
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
                "line-color": [
                  "match",
                  ["get", "type"],
                  "relief_run",
                  "#22c55e",
                  "#38bdf8",
                ],
                "line-width": 2,
                "line-opacity": 0.7,
                "line-dasharray": [
                  "match",
                  ["get", "type"],
                  "relief_run",
                  [4, 2],
                  [2, 2],
                ],
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

        {mapLoaded && layers.events && eventsCircleGeoJSON.features.length > 0 && (
          <Source id="event-circles" type="geojson" data={eventsCircleGeoJSON}>
            <Layer
              id="event-circles-layer"
              type="circle"
              paint={{
                "circle-radius": 10,
                "circle-color": [
                  "match",
                  ["get", "severity"],
                  "critical", "#ef4444",
                  "high", "#f97316",
                  "medium", "#eab308",
                  "#38bdf8",
                ],
                "circle-opacity": 0.75,
                "circle-stroke-width": 2,
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
                isNewest={newestEventIds.has(evt.id)}
                onClick={() => {
                  setSelectedEventId(evt.id);
                  setSelectedNewsEventId(null);
                  setRightPanelOpen(true);
                  setRightPanelTab("news_feed");
                }}
              />
            </Marker>
          ))}
        {layers.events &&
          newsEvents
            .filter((evt) => evt.lat != null && evt.lng != null)
            .map((evt) => (
              <Marker
                key={evt.id}
                longitude={evt.lng!}
                latitude={evt.lat!}
                anchor="center"
              >
                <EventMarker
                  event={{
                    id: evt.id,
                    severity: evt.severity,
                    lat: evt.lat!,
                    lng: evt.lng!,
                    location_name: evt.headline,
                  }}
                  isNewest={newestEventIds.has(evt.id)}
                  onClick={() => {
                    setSelectedNewsEventId(evt.id);
                    setSelectedEventId(null);
                    setRightPanelOpen(true);
                    setRightPanelTab("news_feed");
                  }}
                />
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
                  onClick={() => {
                    if (f.properties?.id) {
                      setSelectedClusterId(f.properties.id);
                      setRightPanelOpen(true);
                      setRightPanelTab("cluster_inspect");
                    }
                  }}
                />
              </Marker>
            );
          })}
        {popupEvent && popupLat != null && popupLng != null && (
          <Popup
            longitude={popupLng}
            latitude={popupLat}
            anchor="bottom"
            closeButton
            closeOnClick={false}
            onClose={() => {
              setSelectedNewsEventId(null);
              setSelectedEventId(null);
            }}
            className="event-popup-speech-bubble"
            maxWidth="320px"
          >
            <div className="rounded-lg bg-popover border border-border shadow-lg p-3 min-w-[200px] max-w-[300px]">
              <p className="font-mono text-[9px] tracking-wider text-primary mb-1.5">EVENT</p>
              <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-2">
                {"headline" in popupEvent ? popupEvent.headline : (popupEvent as HipEvent).location_name}
              </p>
              <p className="font-mono text-[8px] text-muted-foreground mt-0.5">
                {"source" in popupEvent ? popupEvent.source : (popupEvent as HipEvent).source_label}
              </p>
              <p className="font-mono text-[8px] text-muted-foreground mt-0.5">
                {timeSince("timestamp" in popupEvent ? (popupEvent as NewsEvent).timestamp : (popupEvent as HipEvent).timestamp)} · {popupLat.toFixed(2)}, {popupLng.toFixed(2)}
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="font-mono text-[9px] px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                  onClick={() => {
                    setRightPanelOpen(true);
                    setRightPanelTab("news_feed");
                  }}
                >
                  Open in feed
                </button>
                {popupHasCoords && (
                  <button
                    type="button"
                    onClick={runPopupAnalysis}
                    disabled={popupAnalysisLoading || popupSatelliteLoading}
                    className="font-mono text-[9px] px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 flex items-center gap-1"
                  >
                    {popupAnalysisLoading || popupSatelliteLoading ? (
                      <span className="animate-pulse">Loading...</span>
                    ) : (
                      <>Get satellite & analyse</>
                    )}
                  </button>
                )}
              </div>
              {popupSatelliteError && (
                <p className="font-mono text-[8px] text-destructive mt-2">{popupSatelliteError}</p>
              )}
              {popupSatelliteResult && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {popupSatelliteResult.snapshots.length > 0 && (
                    <div>
                      <p className="font-mono text-[7px] tracking-wider text-muted-foreground mb-1">SATELLITE</p>
                      <div className="flex gap-1 overflow-x-auto">
                        {popupSatelliteResult.snapshots.map((snap) => (
                          <div key={snap.period_label} className="flex-shrink-0 w-14">
                            <img
                              src={snap.scene_id ? getSatellitePreviewUrl(snap.scene_id) : snap.image_url}
                              alt={snap.period_label}
                              className="w-14 h-14 object-cover rounded border border-border"
                            />
                            <p className="font-mono text-[6px] text-muted-foreground truncate">{snap.period_label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {popupSatelliteResult.aid_impact && (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => setPopupHeliosOverviewOpen((o) => !o)}
                        className="flex items-center gap-1.5 w-full text-left font-mono text-[7px] tracking-wider text-primary hover:text-primary/80"
                        aria-expanded={popupHeliosOverviewOpen}
                      >
                        <Bot className="w-2.5 h-2.5 flex-shrink-0" />
                        HELIOS AI overview
                        {popupHeliosOverviewOpen ? (
                          <ChevronUp className="w-2.5 h-2.5 ml-auto flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-2.5 h-2.5 ml-auto flex-shrink-0" />
                        )}
                      </button>
                      {popupHeliosOverviewOpen && (
                        <div className="pl-4 space-y-1 border-l-2 border-primary/20">
                          {popupSatelliteResult.aid_impact.summary && (
                            <div>
                              <p className="font-mono text-[6px] text-muted-foreground">Brief description</p>
                              <p className="text-[9px] text-foreground/90 leading-snug line-clamp-2">
                                {popupSatelliteResult.aid_impact.summary}
                              </p>
                            </div>
                          )}
                          {popupSatelliteResult.aid_impact.problems && (
                            <div>
                              <p className="font-mono text-[6px] text-muted-foreground">What to watch out for</p>
                              <p className="text-[8px] text-foreground/90 leading-snug line-clamp-2">
                                {popupSatelliteResult.aid_impact.problems}
                              </p>
                            </div>
                          )}
                          {popupSatelliteResult.aid_impact.infrastructure_note && (
                            <div>
                              <p className="font-mono text-[6px] text-muted-foreground">Infrastructure</p>
                              <p className="text-[8px] text-foreground/90 leading-snug line-clamp-2">
                                {popupSatelliteResult.aid_impact.infrastructure_note}
                              </p>
                            </div>
                          )}
                          {popupSatelliteResult.aid_impact.realistic_solutions && (
                            <div>
                              <p className="font-mono text-[6px] text-muted-foreground">Realistic solutions</p>
                              <p className="text-[8px] text-foreground/90 leading-snug line-clamp-2">
                                {popupSatelliteResult.aid_impact.realistic_solutions}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Popup>
        )}
      </Map>

      <div className="map-hud-overlay">
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
          {!rightPanelOpen && (
            <button
              type="button"
              className="map-layer-btn flex items-center gap-2 w-full"
              onClick={() => {
                setRightPanelOpen(true);
                setRightPanelTab("agent");
              }}
            >
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              <span>HELIOS</span>
            </button>
          )}
        </div>

        {/* Right: single LEGEND panel with Severity + Layers inside */}
        <div className="map-right-stack">
          <div className="map-legend-controls map-hud-panel">
            <button
              type="button"
              className="map-layer-controls-bar flex items-center justify-between gap-2 w-full py-2 px-2 rounded-sm hover:bg-white/5 transition-colors"
              onClick={() => setLegendOpen((o) => !o)}
              aria-expanded={legendOpen}
              aria-label={legendOpen ? "Minimize legend" : "Expand legend"}
            >
              <span className="map-layer-header mb-0">LEGEND</span>
              {legendOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-[var(--text-dim)] flex-shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-dim)] flex-shrink-0" />
              )}
            </button>
            <AnimatePresence initial={false}>
              {legendOpen && (
                <motion.div
                  className="flex flex-col gap-2 pt-2 pb-0"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div>
                    <p className="map-layer-header mb-1">SEVERITY</p>
                    <div className="space-y-1.5">
                      {LEGEND_SEVERITY_ITEMS.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center gap-2 map-legend-row"
                        >
                          <div
                            className="w-2 h-2 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="map-legend-item">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="map-layer-header mb-1">LAYERS</p>
                    <div className="flex flex-col gap-0.5">
                      {LAYER_META.map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          className={`map-layer-btn ${layers[key as keyof typeof layers] ? "active" : ""}`}
                          onClick={() => toggleLayer(key)}
                        >
                          <span className={`map-layer-dot ${key}`} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="map-hud-meta">
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
          <div className="map-hud-meta-divider">PROJ: MERCATOR</div>
          <div>DATUM: WGS84</div>
          <div className="highlight">
            {clusters.features.length} CLUSTERS
          </div>
        </div>
      </div>
    </div>
  );
}
