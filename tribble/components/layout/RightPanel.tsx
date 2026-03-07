"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Newspaper, Bot, Radio, Target, MapPin } from "lucide-react";
import { spring } from "@/lib/animation-tokens";
import { useUIStore } from "@/store/uiSlice";
import { useData } from "@/context/DataContext";
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
  const { selectedEventId, selectedNewsEventId } = useUIStore();
  const selectedNewsRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (selectedNewsEventId && selectedNewsRef.current) {
      selectedNewsRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedNewsEventId]);

  const selectedPlaceholderEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId)
    : null;
  const selectedNewsEvent = selectedNewsEventId
    ? newsEvents.find((e) => e.id === selectedNewsEventId)
    : null;

  if (newsEvents.length === 0) {
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
          {newsEvents.length} events
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
            </div>
          )}
        </div>
      )}

      {newsEvents.map((evt) => (
        <button
          key={evt.id}
          ref={evt.id === selectedNewsEventId ? selectedNewsRef : undefined}
          type="button"
          className={`w-full text-left p-2.5 rounded-md hover:bg-muted/50 transition-colors group ${
            evt.id === selectedNewsEventId ? "ring-2 ring-primary bg-primary/5" : ""
          }`}
          onClick={() => flyToEvent(evt.lat, evt.lng)}
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
                  <MapPin className="w-3 h-3 text-muted-foreground/70 flex-shrink-0" title="On map" />
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
