"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  Construction,
  MapPin,
  Radio,
  FileText,
  Loader2,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useUIStore } from "@/store/uiSlice";
import { useData } from "@/context/DataContext";
import { sendEventsSummaryMessage, getReliefRunsByCluster } from "@/lib/api";
import type { NewsEvent, ReliefRunItem } from "@/lib/api";

const SEVERITY_LABEL: Record<string, { text: string; color: string }> = {
  high: { text: "HIGH THREAT", color: "text-red-400" },
  medium: { text: "MEDIUM THREAT", color: "text-orange-400" },
  low: { text: "LOW THREAT", color: "text-cyan-400" },
};

function getSeverityLevel(severity?: number): "high" | "medium" | "low" {
  if (severity == null) return "low";
  if (severity >= 0.7) return "high";
  if (severity >= 0.4) return "medium";
  return "low";
}

function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = (lat2 - lat1) * 111;
  const dLng = (lng2 - lng1) * 111 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function flyTo(lat: number, lng: number) {
  window.dispatchEvent(
    new CustomEvent("hip:flyTo", { detail: { lng, lat, zoom: 9 } })
  );
}

const DEFAULT_SUMMARY_PROMPT =
  "Summarize these events in 2-3 sentences. Focus on main themes and any escalation risks.";

function EventsSummaryBlock({ events }: { events: NewsEvent[] }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventsKeyRef = useRef<string>("");

  const eventsKey = events.map((e) => e.id).sort().join(",");

  useEffect(() => {
    if (events.length === 0) return;
    if (eventsKeyRef.current === eventsKey) return;
    eventsKeyRef.current = eventsKey;
    setLoading(true);
    setError(null);
    setSummary(null);

    sendEventsSummaryMessage(DEFAULT_SUMMARY_PROMPT, events)
      .then((reply) => {
        setSummary(reply);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Summary unavailable");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [eventsKey, events]);

  return (
    <div className="pt-2 border-t border-border">
      <div className="flex items-center gap-1.5 mb-1.5">
        <FileText className="w-3 h-3 text-primary" />
        <p className="font-mono text-[9px] tracking-wider text-muted-foreground">
          SUMMARY
        </p>
      </div>
      {loading && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          <span className="font-mono text-[10px] text-muted-foreground">
            Summarizing...
          </span>
        </div>
      )}
      {error && (
        <p className="font-mono text-[10px] text-destructive/80">{error}</p>
      )}
      {!loading && summary && (
        <p className="text-[11px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
          {summary}
        </p>
      )}
    </div>
  );
}

export function ClusterInspectPanel() {
  const { selectedClusterId } = useUIStore();
  const { clusters, newsEvents } = useData();
  const [reliefRuns, setReliefRuns] = useState<ReliefRunItem[]>([]);
  const [reliefLoading, setReliefLoading] = useState(false);

  useEffect(() => {
    if (!selectedClusterId) {
      setReliefRuns([]);
      return;
    }
    setReliefLoading(true);
    getReliefRunsByCluster(selectedClusterId)
      .then((res) => setReliefRuns(res.items))
      .catch(() => setReliefRuns([]))
      .finally(() => setReliefLoading(false));
  }, [selectedClusterId]);

  const feature = useMemo(
    () =>
      clusters.features.find((f) => f.properties?.id === selectedClusterId) ??
      null,
    [clusters, selectedClusterId]
  );

  const nearbyEvents = useMemo(() => {
    if (!feature) return [];
    const [cLng, cLat] = feature.geometry.coordinates;
    const radius = feature.properties?.radius_km ?? 50;
    return newsEvents.filter((evt) => {
      if (evt.lat == null || evt.lng == null) return false;
      return distanceKm(cLat, cLng, evt.lat, evt.lng) <= radius;
    });
  }, [feature, newsEvents]);

  if (!feature) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldAlert className="w-6 h-6 text-muted-foreground mb-3" />
        <p className="font-mono text-xs text-muted-foreground">
          Click a cluster marker to inspect
        </p>
      </div>
    );
  }

  const props = feature.properties!;
  const level = getSeverityLevel(props.weighted_severity);
  const sev = SEVERITY_LABEL[level];
  const [lng, lat] = feature.geometry.coordinates;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          <span className={`font-mono text-xs font-bold tracking-wider ${sev.color}`}>
            {sev.text}
          </span>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          {props.id ?? "Cluster"} · {props.report_count ?? 0} reports ·{" "}
          {lat.toFixed(2)}, {lng.toFixed(2)}
        </p>
        {props.country && (
          <p className="font-mono text-[10px] text-muted-foreground/70 mt-0.5">
            {props.country}
          </p>
        )}
      </div>

      {/* Severity bar */}
      <div>
        <p className="font-mono text-[9px] tracking-wider text-muted-foreground mb-1">
          SEVERITY SCORE
        </p>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(props.weighted_severity ?? 0) * 100}%`,
              background:
                level === "high"
                  ? "#ef4444"
                  : level === "medium"
                    ? "#ff6a00"
                    : "#38bdf8",
            }}
          />
        </div>
        <p className="font-mono text-[9px] text-right text-muted-foreground mt-0.5">
          {((props.weighted_severity ?? 0) * 100).toFixed(0)}%
        </p>
      </div>

      {/* Top need categories */}
      {props.top_need_categories && props.top_need_categories.length > 0 && (
        <div>
          <p className="font-mono text-[9px] tracking-wider text-muted-foreground mb-1.5">
            TOP NEEDS
          </p>
          <div className="flex flex-wrap gap-1.5">
            {props.top_need_categories.map((cat) => (
              <span
                key={cat}
                className="font-mono text-[9px] px-2 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/20"
              >
                {cat.replace(/_/g, " ").toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Access blockers */}
      {props.access_blockers && props.access_blockers.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            <p className="font-mono text-[9px] tracking-wider text-muted-foreground">
              ACCESS BLOCKERS
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {props.access_blockers.map((b) => (
              <span
                key={b}
                className="font-mono text-[9px] px-2 py-0.5 rounded-sm bg-orange-500/10 text-orange-400 border border-orange-500/20"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Infrastructure hazards */}
      {props.infrastructure_hazards &&
        props.infrastructure_hazards.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Construction className="w-3 h-3 text-yellow-400" />
              <p className="font-mono text-[9px] tracking-wider text-muted-foreground">
                INFRASTRUCTURE HAZARDS
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {props.infrastructure_hazards.map((h) => (
                <span
                  key={h}
                  className="font-mono text-[9px] px-2 py-0.5 rounded-sm bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

      {/* Evidence summary */}
      {props.evidence_summary && (
        <div>
          <p className="font-mono text-[9px] tracking-wider text-muted-foreground mb-1">
            EVIDENCE SUMMARY
          </p>
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            {props.evidence_summary}
          </p>
        </div>
      )}

      {/* Nearby ACLED events */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Radio className="w-3 h-3 text-[hsl(var(--hip-critical))] animate-pulse" />
          <p className="font-mono text-[9px] tracking-wider text-muted-foreground">
            NEARBY EVENTS ({nearbyEvents.length})
          </p>
        </div>
        {nearbyEvents.length === 0 ? (
          <p className="font-mono text-[10px] text-muted-foreground/60">
            No ACLED events within range
          </p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-auto">
            {nearbyEvents.map((evt) => (
              <button
                key={evt.id}
                type="button"
                className="w-full text-left p-2 rounded-sm hover:bg-muted/50 transition-colors"
                onClick={() => {
                  if (evt.lat != null && evt.lng != null) flyTo(evt.lat, evt.lng);
                }}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-foreground/80 line-clamp-2 leading-tight">
                      {evt.headline}
                    </p>
                    <p className="font-mono text-[8px] text-muted-foreground mt-0.5">
                      {evt.source} · {evt.severity}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Auto-presented summary of nearby events */}
      {nearbyEvents.length > 0 && (
        <EventsSummaryBlock events={nearbyEvents} />
      )}

      {/* Relief en route */}
      <div className="pt-2 border-t border-border">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Truck className="w-3 h-3 text-green-500" />
          <p className="font-mono text-[9px] tracking-wider text-muted-foreground">
            RELIEF EN ROUTE
          </p>
        </div>
        {reliefLoading && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span className="font-mono text-[10px] text-muted-foreground">
              Loading...
            </span>
          </div>
        )}
        {!reliefLoading && reliefRuns.length === 0 && (
          <p className="font-mono text-[10px] text-muted-foreground/60">
            No relief runs linked to this cluster yet
          </p>
        )}
        {!reliefLoading && reliefRuns.length > 0 && (
          <div className="space-y-2">
            {reliefRuns.map((run) => (
              <div
                key={run.id}
                className="p-2 rounded-sm bg-green-500/5 border border-green-500/20"
              >
                <p className="font-mono text-[10px] text-foreground/90 font-medium">
                  {run.organisation_name}
                </p>
                <p className="text-[10px] text-foreground/75 mt-0.5 line-clamp-2">
                  {run.what_doing}
                </p>
                <p className="font-mono text-[9px] text-muted-foreground mt-1">
                  Providing: {run.what_providing.join(", ")}
                </p>
              </div>
            ))}
          </div>
        )}
        {!reliefLoading && (
          <Link
            href={`/app/relief?cluster=${selectedClusterId ?? ""}`}
            className="inline-block font-mono text-[10px] text-primary hover:underline mt-1"
          >
            We&apos;re responding to this cluster →
          </Link>
        )}
      </div>
    </div>
  );
}
