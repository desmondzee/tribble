"use client";

import { useState, useCallback, useEffect } from "react";
import { Calendar, ImageIcon, Cloud, ExternalLink } from "lucide-react";
import {
  getSatelliteScenes,
  getSatelliteScenesIntervals,
  type SatelliteScene,
  type SatelliteSceneInterval,
} from "@/lib/api";

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
  const [imgError, setImgError] = useState(false);
  const showThumb = scene.tile_url && !imgError;
  return (
    <div className="border-b border-border/60 py-2 px-3 flex items-center gap-3">
      {showThumb && scene.tile_url && (
        <a
          href={scene.tile_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 w-14 h-14 rounded overflow-hidden border border-border bg-muted"
          title="Open full image"
        >
          <img
            src={scene.tile_url}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </a>
      )}
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
  const [intervals, setIntervals] = useState<SatelliteSceneInterval[]>([]);
  const [intervalsRange, setIntervalsRange] = useState<{ min_date: string | null; max_date: string | null }>({
    min_date: null,
    max_date: null,
  });
  const [intervalsLoading, setIntervalsLoading] = useState(true);
  const [intervalsError, setIntervalsError] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<SatelliteSceneInterval | null>(null);
  const [scenes, setScenes] = useState<SatelliteScene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIntervalsLoading(true);
    setIntervalsError(null);
    getSatelliteScenesIntervals()
      .then((data) => {
        if (cancelled) return;
        setIntervals(data.intervals);
        setIntervalsRange({ min_date: data.min_date, max_date: data.max_date });
        if (data.intervals.length > 0) setSelectedInterval(data.intervals[0]);
      })
      .catch((e) => {
        if (!cancelled) {
          setIntervalsError(e instanceof Error ? e.message : "Failed to load intervals");
          setIntervals([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIntervalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchScenes = useCallback(async (interval: SatelliteSceneInterval) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSatelliteScenes(interval.date_from, interval.date_to);
      setScenes(data.scenes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenes");
      setScenes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedInterval) fetchScenes(selectedInterval);
  }, [selectedInterval?.date_from, selectedInterval?.date_to, fetchScenes]);

  return (
    <div className="pointer-events-auto flex h-full">
      <aside className="w-56 flex-shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-heading text-xs tracking-wider text-foreground flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            SATELLITE SCENES
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {intervalsRange.min_date && intervalsRange.max_date
              ? `${intervalsRange.min_date} – ${intervalsRange.max_date} (5-day intervals)`
              : "Intervals from open data"}
          </p>
        </div>
        {intervalsLoading && (
          <p className="p-3 font-mono text-[10px] text-muted-foreground">Loading…</p>
        )}
        {intervalsError && (
          <p className="p-3 font-body text-xs text-destructive">{intervalsError}</p>
        )}
        {!intervalsLoading && intervals.length === 0 && !intervalsError && (
          <p className="p-3 font-body text-xs text-muted-foreground">
            No satellite data in database. Run the backend seed to populate scenes from Sentinel-2 (Planetary Computer).
          </p>
        )}
        <nav className="flex-1 overflow-auto py-2">
          {intervals.map((interval) => (
            <button
              key={interval.date_from}
              type="button"
              onClick={() => setSelectedInterval(interval)}
              className={`w-full text-left px-3 py-2 font-mono text-[11px] transition-colors ${
                selectedInterval?.date_from === interval.date_from
                  ? "bg-primary/15 text-primary border-l-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-card border-l-2 border-transparent"
              }`}
            >
              {interval.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto p-4">
        {!selectedInterval ? (
          <p className="font-body text-sm text-muted-foreground">
            {intervals.length === 0 ? "Load intervals from the database first." : "Select an interval from the sidebar."}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-sm tracking-wider text-foreground">
                {selectedInterval.label}
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
                No satellite scenes in this period.
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
