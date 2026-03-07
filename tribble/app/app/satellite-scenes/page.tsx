"use client";

import { useState, useCallback, useEffect } from "react";
import { Calendar, ImageIcon, Cloud, ExternalLink } from "lucide-react";
import { getSatelliteScenes, type SatelliteScene } from "@/lib/api";

const MAY_2024_INTERVALS: { label: string; dateFrom: string; dateTo: string }[] = [
  { label: "May 1–5", dateFrom: "2024-05-01", dateTo: "2024-05-05" },
  { label: "May 6–10", dateFrom: "2024-05-06", dateTo: "2024-05-10" },
  { label: "May 11–15", dateFrom: "2024-05-11", dateTo: "2024-05-15" },
  { label: "May 16–20", dateFrom: "2024-05-16", dateTo: "2024-05-20" },
  { label: "May 21–25", dateFrom: "2024-05-21", dateTo: "2024-05-25" },
  { label: "May 26–31", dateFrom: "2024-05-26", dateTo: "2024-05-31" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function SceneRow({ scene }: { scene: SatelliteScene }) {
  return (
    <div className="border-b border-border/60 py-2 px-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-foreground truncate" title={scene.scene_id}>
          {scene.scene_id}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
          {formatDate(scene.acquisition_date)}
          {scene.cloud_cover_pct != null && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Cloud className="w-3 h-3" />
              {Math.round(scene.cloud_cover_pct)}%
            </span>
          )}
        </p>
      </div>
      {scene.tile_url && (
        <a
          href={scene.tile_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-primary hover:underline flex items-center gap-1 font-mono text-[10px]"
        >
          View <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

export default function SatelliteScenesPage() {
  const [selectedInterval, setSelectedInterval] = useState<(typeof MAY_2024_INTERVALS)[0] | null>(
    MAY_2024_INTERVALS[0]
  );
  const [scenes, setScenes] = useState<SatelliteScene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchScenes = useCallback(async (interval: (typeof MAY_2024_INTERVALS)[0]) => {
    setSelectedInterval(interval);
    setLoading(true);
    setError(null);
    try {
      const data = await getSatelliteScenes(interval.dateFrom, interval.dateTo);
      setScenes(data.scenes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenes");
      setScenes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load first interval on mount
  useEffect(() => {
    if (MAY_2024_INTERVALS[0]) fetchScenes(MAY_2024_INTERVALS[0]);
  }, [fetchScenes]);

  return (
    <div className="pointer-events-auto flex h-full">
      {/* Sidebar: May 2024, 5-day intervals */}
      <aside className="w-56 flex-shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-heading text-xs tracking-wider text-foreground flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            SATELLITE SCENES
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            May 2024 (5-day intervals)
          </p>
        </div>
        <nav className="flex-1 overflow-auto py-2">
          {MAY_2024_INTERVALS.map((interval) => (
            <button
              key={interval.dateFrom}
              type="button"
              onClick={() => fetchScenes(interval)}
              className={`w-full text-left px-3 py-2 font-mono text-[11px] transition-colors ${
                selectedInterval?.dateFrom === interval.dateFrom
                  ? "bg-primary/15 text-primary border-l-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-card border-l-2 border-transparent"
              }`}
            >
              {interval.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main: scene list for selected interval */}
      <main className="flex-1 overflow-auto p-4">
        {!selectedInterval ? (
          <p className="font-body text-sm text-muted-foreground">
            Select an interval from the sidebar.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-sm tracking-wider text-foreground">
                {selectedInterval.label} 2024
              </h3>
              {loading && (
                <span className="font-mono text-[10px] text-muted-foreground">Loading…</span>
              )}
            </div>
            {error && (
              <p className="font-body text-sm text-destructive mb-3">{error}</p>
            )}
            {!loading && !error && scenes.length === 0 && (
              <p className="font-body text-sm text-muted-foreground">
                No satellite scenes in this period. Run the backend seed to populate May 2024 data.
              </p>
            )}
            {!loading && scenes.length > 0 && (
              <div className="rounded-sm border border-border divide-y divide-border/60">
                {scenes.map((scene) => (
                  <SceneRow key={scene.id} scene={scene} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
