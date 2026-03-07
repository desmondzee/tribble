"use client";

import { useState, useCallback } from "react";
import {
  getRouteSuggest,
  type RouteSuggestResponse,
  type SuggestedRoute,
  type RecentEventNearby,
} from "@/lib/api";
import { MapPin, Route, AlertTriangle, Loader2 } from "lucide-react";
import { CollapsibleFormPanel } from "@/components/CollapsibleFormPanel";

const AVOID_HOURS_OPTIONS = [24, 72, 168] as const;
const RISK_COLOR: Record<string, string> = {
  critical: "text-[hsl(var(--hip-critical))]",
  high: "text-orange-500",
  moderate: "text-yellow-600",
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

function RouteCard({ route }: { route: SuggestedRoute }) {
  const riskClass = RISK_COLOR[route.risk_level] ?? RISK_COLOR.low;
  const notRecommended = route.recommended === false;
  const suggestedLabel =
    route.recommended === true && route.type === "alternative"
      ? "Suggested route"
      : null;
  return (
    <div
      className={`rounded-md border p-4 ${
        notRecommended
          ? "border-[hsl(var(--hip-critical))]/40 bg-[hsl(var(--hip-critical))]/5"
          : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {route.type === "primary" ? (
          <Route className="w-4 h-4 text-primary" />
        ) : (
          <MapPin className="w-4 h-4 text-orange-500" />
        )}
        <span className="font-mono text-xs font-medium text-foreground">
          {route.summary}
        </span>
        {notRecommended && (
          <span className="font-mono text-[10px] font-bold uppercase text-[hsl(var(--hip-critical))]">
            Not recommended
          </span>
        )}
        {suggestedLabel && (
          <span className="font-mono text-[10px] font-bold uppercase text-primary">
            {suggestedLabel}
          </span>
        )}
        {!notRecommended && !suggestedLabel && (
          <span className={`font-mono text-[10px] font-bold uppercase ml-auto ${riskClass}`}>
            {route.risk_level}
          </span>
        )}
        {notRecommended && (
          <span className={`font-mono text-[10px] font-bold uppercase ml-auto ${riskClass}`}>
            {route.risk_level}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {route.advisory}
      </p>
      {route.distance_km != null && (
        <p className="font-mono text-[10px] text-muted-foreground mt-1.5">
          ~{route.distance_km} km
        </p>
      )}
    </div>
  );
}

function EventItem({ event }: { event: RecentEventNearby }) {
  const severityClass =
    event.severity === "critical"
      ? "text-[hsl(var(--hip-critical))]"
      : event.severity === "high"
        ? "text-orange-500"
        : "text-muted-foreground";
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${severityClass}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-foreground leading-tight line-clamp-2">
          {event.headline}
        </p>
        <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
          {timeSince(event.timestamp)} · {event.severity}
        </p>
      </div>
    </div>
  );
}

export default function RoutesPage() {
  const [fromLat, setFromLat] = useState("13.5");
  const [fromLng, setFromLng] = useState("25.2");
  const [toLat, setToLat] = useState("13.7");
  const [toLng, setToLng] = useState("25.5");
  const [avoidRecentHours, setAvoidRecentHours] = useState<number>(24);
  const [result, setResult] = useState<RouteSuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSuggest = useCallback(async () => {
    const from_lat = parseFloat(fromLat);
    const from_lng = parseFloat(fromLng);
    const to_lat = parseFloat(toLat);
    const to_lng = parseFloat(toLng);
    if (
      Number.isNaN(from_lat) ||
      Number.isNaN(from_lng) ||
      Number.isNaN(to_lat) ||
      Number.isNaN(to_lng)
    ) {
      setError("Enter valid numbers for all coordinates.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await getRouteSuggest({
        from_lat: from_lat,
        from_lng: from_lng,
        to_lat: to_lat,
        to_lng: to_lng,
        avoid_recent_hours: avoidRecentHours,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load route suggestions.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [fromLat, fromLng, toLat, toLng, avoidRecentHours]);

  return (
    <div className="pointer-events-auto p-6 max-w-2xl">
      <CollapsibleFormPanel
        title="SAFE ROUTES"
        subtitle="Get route suggestions that avoid recent incidents. Enter origin and destination coordinates and how far back to consider events."
        icon={<Route className="w-4 h-4" />}
      >
      <div className="space-y-4">
        <div>
          <label className="font-mono text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
            Origin (lat, lng)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={fromLat}
              onChange={(e) => setFromLat(e.target.value)}
              placeholder="13.5"
              className="flex-1 rounded border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <input
              type="text"
              value={fromLng}
              onChange={(e) => setFromLng(e.target.value)}
              placeholder="25.2"
              className="flex-1 rounded border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>
        <div>
          <label className="font-mono text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
            Destination (lat, lng)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={toLat}
              onChange={(e) => setToLat(e.target.value)}
              placeholder="13.7"
              className="flex-1 rounded border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <input
              type="text"
              value={toLng}
              onChange={(e) => setToLng(e.target.value)}
              placeholder="25.5"
              className="flex-1 rounded border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>
        <div>
          <label className="font-mono text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
            Avoid events from the last
          </label>
          <select
            value={avoidRecentHours}
            onChange={(e) => setAvoidRecentHours(Number(e.target.value))}
            className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-sm"
          >
            {AVOID_HOURS_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h === 24 ? "24 hours" : h === 72 ? "72 hours" : "7 days"}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full rounded-md bg-primary text-primary-foreground py-2.5 font-mono text-xs font-medium tracking-wider hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </>
          ) : (
            <>
              <Route className="w-4 h-4" />
              Suggest routes
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-md border border-[hsl(var(--hip-critical))]/30 bg-[hsl(var(--hip-critical))]/10">
          <p className="text-[11px] text-foreground">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          {result.narrative && (
            <div className="p-3 rounded-md bg-primary/10 border border-primary/20">
              <p className="text-[11px] text-foreground leading-snug">
                {result.narrative}
              </p>
            </div>
          )}
          <div>
            <h3 className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-2">
              Route suggestions
            </h3>
            <div className="space-y-2">
              {result.suggested_routes.map((route, i) => (
                <RouteCard key={`${route.type}-${i}`} route={route} />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 italic">
              These are suggestions only; always verify conditions on the ground.
            </p>
          </div>
          {result.recent_events_nearby.length > 0 && (
            <div>
              <h3 className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-2">
                Recent events near path
              </h3>
              <div className="rounded-md border border-border bg-muted/20 p-3">
                {result.recent_events_nearby.map((event) => (
                  <EventItem key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </CollapsibleFormPanel>
    </div>
  );
}
