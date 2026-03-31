"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Newspaper, Bot, Radio, Target, MapPin, Satellite, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { spring } from "@/lib/animation-tokens";
import { useUIStore } from "@/store/uiSlice";
import { useData } from "@/context/DataContext";
import { useReportsStore } from "@/store/reportsSlice";
import {
  type NewsEvent,
  getEventSatelliteResults,
  runEventSatelliteAnalysis,
  getSatellitePreviewUrl,
  type EventSatelliteResult,
} from "@/lib/api";
import { ClusterInspectPanel } from "./ClusterInspectPanel";
import { HeliosChat } from "./HeliosChat";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "bg-[hsl(var(--hip-critical))]",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-[hsl(var(--hip-low))]",
};

const SEVERITY_TEXT: Record<string, string> = {
  critical: "text-[hsl(var(--hip-critical))]",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-muted-foreground",
};

function timeSince(ts: string | null): string {
  if (!ts) return "—";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 0) return "now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function flyToEvent(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return;
  window.dispatchEvent(
    new CustomEvent("hip:flyTo", { detail: { lng, lat, zoom: 9 } })
  );
}

function NewsFeed() {
  const { newsEvents, events } = useData();
  const myReports = useReportsStore((s) => s.myReports);
  const {
    selectedEventId,
    selectedNewsEventId,
    setSelectedNewsEventId,
    setSelectedEventId,
    setRightPanelOpen,
    setRightPanelTab,
  } = useUIStore();
  const selectedNewsRef = useRef<HTMLButtonElement | null>(null);

  const [eventSatelliteResult, setEventSatelliteResult] = useState<EventSatelliteResult | null>(null);
  const [satelliteLoading, setSatelliteLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [satelliteError, setSatelliteError] = useState<string | null>(null);
  const [heliosOverviewOpen, setHeliosOverviewOpen] = useState(true);

  const feedItems: NewsEvent[] = useMemo(() => {
    const myReportItems: NewsEvent[] = myReports.map((r) => ({
      id: `my-${r.report_id}`,
      headline: r.narrative.length > 80 ? r.narrative.slice(0, 77) + "…" : r.narrative,
      source: "My report",
      severity: (r.crisis_categories.length ? "medium" : "low") as "critical" | "high" | "medium" | "low",
      timestamp: r.submitted_at,
      lat: r.lat,
      lng: r.lng,
      country: null,
      event_type: r.crisis_categories[0] ?? null,
    }));
    return [...myReportItems, ...newsEvents];
  }, [myReports, newsEvents]);

  useEffect(() => {
    if (selectedNewsEventId && selectedNewsRef.current) {
      selectedNewsRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedNewsEventId]);

  const selectedPlaceholderEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId)
    : null;
  const selectedNewsEvent = selectedNewsEventId
    ? feedItems.find((e) => e.id === selectedNewsEventId)
    : null;

  const hasCoords =
    (selectedNewsEvent && selectedNewsEvent.lat != null && selectedNewsEvent.lng != null) ||
    !!selectedPlaceholderEvent;
  const selectedIdForSatellite = selectedNewsEventId || selectedEventId;

  useEffect(() => {
    if (!selectedIdForSatellite || !hasCoords) {
      setEventSatelliteResult(null);
      setSatelliteError(null);
      return;
    }
    let cancelled = false;
    setSatelliteError(null);
    setSatelliteLoading(true);
    getEventSatelliteResults([selectedIdForSatellite])
      .then((data) => {
        if (cancelled) return;
        const first = data.results.find((r) => r.event_id === selectedIdForSatellite);
        setEventSatelliteResult(first ?? null);
      })
      .catch((err) => {
        if (!cancelled) setSatelliteError(err instanceof Error ? err.message : "Failed to load analysis");
      })
      .finally(() => {
        if (!cancelled) setSatelliteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedIdForSatellite, hasCoords]);

  const runAnalysis = useCallback(async () => {
    if (!hasCoords) return;
    setSatelliteError(null);
    setAnalysisLoading(true);
    try {
      if (selectedNewsEvent && selectedNewsEvent.lat != null && selectedNewsEvent.lng != null) {
        const data = await runEventSatelliteAnalysis([selectedNewsEvent]);
        const first = data.results.find(
          (r) => r.event_id === selectedNewsEvent.id || (data.results.length === 1 && r.event_id)
        );
        if (first) setEventSatelliteResult(first);
      } else if (selectedPlaceholderEvent) {
        const payload = {
          id: selectedPlaceholderEvent.id,
          headline: selectedPlaceholderEvent.description || selectedPlaceholderEvent.location_name,
          lat: selectedPlaceholderEvent.lat,
          lng: selectedPlaceholderEvent.lng,
          timestamp: selectedPlaceholderEvent.timestamp,
        };
        const data = await runEventSatelliteAnalysis([payload]);
        const first = data.results.find(
          (r) => r.event_id === selectedPlaceholderEvent.id || (data.results.length === 1 && r.event_id)
        );
        if (first) setEventSatelliteResult(first);
      }
    } catch (err) {
      setSatelliteError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysisLoading(false);
    }
  }, [hasCoords, selectedNewsEvent, selectedPlaceholderEvent]);

  if (feedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Radio className="w-6 h-6 text-muted-foreground mb-3 animate-pulse" />
        <p className="font-mono text-xs text-muted-foreground">
          Connecting to live feed...
        </p>
        <p className="font-mono text-[10px] text-muted-foreground/60 mt-1">
          ACLED events will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-1 pb-2 border-b border-border mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--hip-critical))] animate-pulse" />
        <span className="font-mono text-[9px] font-bold tracking-widest text-[hsl(var(--hip-critical))]">
          LIVE FEED
        </span>
        <span className="font-mono text-[9px] text-muted-foreground ml-auto">
          {feedItems.length} events
        </span>
      </div>

      {(selectedPlaceholderEvent || selectedNewsEvent) && (
        <div className="mb-3 p-3 rounded-md bg-primary/10 border border-primary/20">
          <p className="font-mono text-[9px] tracking-wider text-primary mb-1.5">
            SELECTED FROM MAP
          </p>
          {selectedPlaceholderEvent && (
            <div>
              <p className="text-[11px] font-medium text-foreground leading-tight">
                {selectedPlaceholderEvent.location_name}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-3">
                {selectedPlaceholderEvent.description}
              </p>
              <p className="font-mono text-[8px] text-muted-foreground mt-1">
                {selectedPlaceholderEvent.source_label} · {selectedPlaceholderEvent.severity}
              </p>
              <p className="font-mono text-[8px] text-muted-foreground/70 mt-0.5">
                {selectedPlaceholderEvent.lat.toFixed(2)}, {selectedPlaceholderEvent.lng.toFixed(2)}
              </p>
            </div>
          )}
          {selectedNewsEvent && (
            <div>
              <p className="text-[11px] font-medium text-foreground leading-tight">
                {selectedNewsEvent.headline}
              </p>
              <p className="font-mono text-[9px] text-primary/70 mt-0.5">{selectedNewsEvent.source}</p>
              <p className="font-mono text-[8px] text-muted-foreground mt-1">
                {timeSince(selectedNewsEvent.timestamp)} · {selectedNewsEvent.severity}
              </p>
              {selectedNewsEvent.lat != null && selectedNewsEvent.lng != null && (
                <p className="font-mono text-[8px] text-muted-foreground/70 mt-0.5">
                  {selectedNewsEvent.lat.toFixed(2)}, {selectedNewsEvent.lng.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Satellite block for either selected news event or selected placeholder event */}
          {hasCoords && (
            <div className="mt-3 pt-3 border-t border-primary/20 space-y-3">
              {satelliteLoading ? (
                <div className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  Loading analysis...
                </div>
              ) : satelliteError ? (
                <div>
                  <div className="flex items-center gap-1.5 font-mono text-[9px] text-destructive mb-1.5">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {satelliteError}
                  </div>
                  <button
                    type="button"
                    onClick={runAnalysis}
                    disabled={analysisLoading}
                    className="flex items-center gap-2 font-mono text-[9px] px-2 py-1.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    {analysisLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Satellite className="w-3 h-3" />
                    )}
                    Get satellite & analyse
                  </button>
                </div>
              ) : eventSatelliteResult ? (
                <>
                  {eventSatelliteResult.snapshots.length > 0 && (
                    <div>
                      <p className="font-mono text-[8px] tracking-wider text-primary mb-1.5">SATELLITE</p>
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {eventSatelliteResult.snapshots.map((snap) => (
                          <div key={snap.period_label} className="flex-shrink-0 w-20">
                            <img
                              src={snap.scene_id ? getSatellitePreviewUrl(snap.scene_id) : snap.image_url}
                              alt={snap.period_label}
                              className="w-20 h-20 object-cover rounded border border-border"
                            />
                            <p className="font-mono text-[7px] text-muted-foreground mt-0.5 truncate">
                              {snap.period_label}
                            </p>
                            <p className="font-mono text-[6px] text-muted-foreground/70 truncate">
                              {snap.acquisition_date?.slice(0, 10) ?? "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {eventSatelliteResult.aid_impact && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => setHeliosOverviewOpen((o) => !o)}
                        className="flex items-center gap-2 w-full text-left font-mono text-[8px] tracking-wider text-primary hover:text-primary/80"
                        aria-expanded={heliosOverviewOpen}
                      >
                        <Bot className="w-3 h-3 flex-shrink-0" />
                        HELIOS AI overview
                        {heliosOverviewOpen ? (
                          <ChevronUp className="w-3 h-3 ml-auto flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-3 h-3 ml-auto flex-shrink-0" />
                        )}
                      </button>
                      {heliosOverviewOpen && (
                        <div className="pl-5 space-y-2 border-l-2 border-primary/20">
                          {eventSatelliteResult.aid_impact.summary && (
                            <div>
                              <p className="font-mono text-[7px] text-muted-foreground mb-0.5">Brief description</p>
                              <p className="text-[10px] text-foreground/90 leading-snug">
                                {eventSatelliteResult.aid_impact.summary}
                              </p>
                            </div>
                          )}
                          {eventSatelliteResult.aid_impact.problems && (
                            <div>
                              <p className="font-mono text-[7px] text-muted-foreground mb-0.5">What to watch out for</p>
                              <p className="text-[9px] text-foreground/90 leading-snug whitespace-pre-wrap">
                                {eventSatelliteResult.aid_impact.problems}
                              </p>
                            </div>
                          )}
                          {eventSatelliteResult.aid_impact.infrastructure_note && (
                            <div>
                              <p className="font-mono text-[7px] text-muted-foreground mb-0.5">Infrastructure</p>
                              <p className="text-[9px] text-foreground/90 leading-snug">
                                {eventSatelliteResult.aid_impact.infrastructure_note}
                              </p>
                            </div>
                          )}
                          {eventSatelliteResult.aid_impact.realistic_solutions && (
                            <div>
                              <p className="font-mono text-[7px] text-muted-foreground mb-0.5">Realistic solutions</p>
                              <p className="text-[9px] text-foreground/90 leading-snug whitespace-pre-wrap">
                                {eventSatelliteResult.aid_impact.realistic_solutions}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={analysisLoading}
                  className="flex items-center gap-2 font-mono text-[9px] px-2 py-1.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  {analysisLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Satellite className="w-3 h-3" />
                  )}
                  Get satellite & analyse
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {feedItems.map((evt) => (
        <button
          key={evt.id}
          ref={evt.id === selectedNewsEventId ? selectedNewsRef : undefined}
          type="button"
          className={`w-full text-left p-2.5 rounded-md hover:bg-muted/50 transition-colors group ${
            evt.id === selectedNewsEventId ? "ring-2 ring-primary bg-primary/5" : ""
          }`}
          onClick={() => {
            setSelectedNewsEventId(evt.id);
            setSelectedEventId(null);
            setRightPanelOpen(true);
            setRightPanelTab("news_feed");
            flyToEvent(evt.lat, evt.lng);
          }}
        >
          <div className="flex items-start gap-2">
            <span
              className={`flex-shrink-0 mt-1 w-4 h-4 rounded-full border-2 ${SEVERITY_COLOR[evt.severity]}`}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {evt.severity === "critical" && (
                  <span className="font-mono text-[7px] font-bold tracking-widest text-[hsl(var(--hip-critical))] bg-[hsl(var(--hip-critical))]/10 px-1 rounded-sm">
                    BREAKING
                  </span>
                )}
                <span className="font-mono text-[9px] text-primary/70 bg-primary/5 px-1 rounded-sm">
                  {evt.source}
                </span>
                {evt.event_type && (
                  <span className="font-mono text-[8px] text-muted-foreground truncate">
                    {evt.event_type}
                  </span>
                )}
                {evt.lat != null && evt.lng != null && (
                  <MapPin className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-foreground/90 leading-tight line-clamp-2 group-hover:text-foreground">
                {evt.headline}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-[9px] text-muted-foreground">
                  {timeSince(evt.timestamp)}
                </span>
                {evt.lat != null && evt.lng != null && (
                  <span className="font-mono text-[8px] text-muted-foreground/50">
                    {evt.lat.toFixed(2)}, {evt.lng.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function RightPanel() {
  const { rightPanelOpen, setRightPanelOpen, rightPanelTab, setRightPanelTab } =
    useUIStore();

  return (
    <AnimatePresence>
      {rightPanelOpen && (
        <motion.aside
          className="h-full flex flex-col flex-shrink-0 border-l border-primary/30 bg-popover/95 backdrop-blur-sm z-20 overflow-hidden"
          initial={{ width: 0 }}
          animate={{ width: 380 }}
          exit={{ width: 0 }}
          transition={spring}
        >
          <div className="flex items-center justify-between h-12 px-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`flex items-center gap-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                  rightPanelTab === "news_feed"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setRightPanelTab("news_feed")}
              >
                <Newspaper className="w-3 h-3" />
                FEED
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                  rightPanelTab === "cluster_inspect"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setRightPanelTab("cluster_inspect")}
              >
                <Target className="w-3 h-3" />
                INSPECT
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                  rightPanelTab === "agent"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setRightPanelTab("agent")}
              >
                <Bot className="w-3 h-3" />
                HELIOS
              </button>
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setRightPanelOpen(false)}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {rightPanelTab === "agent" ? (
            <div className="flex-1 overflow-hidden">
              <HeliosChat />
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-3">
              {rightPanelTab === "news_feed" ? (
                <NewsFeed />
              ) : (
                <ClusterInspectPanel />
              )}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
