"use client";

import type { HipEvent } from "@/types";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#38bdf8",
};

const NEWEST_ORANGE = "#f97316";

/** Minimal event shape for map marker (full HipEvent or NewsEvent-derived). */
export type EventMarkerEvent = Pick<HipEvent, "id" | "severity" | "lat" | "lng"> & {
  location_name?: string;
};

interface EventMarkerProps {
  event: EventMarkerEvent;
  onClick?: () => void;
  isNewest?: boolean;
}

export function EventMarker({ event, onClick, isNewest }: EventMarkerProps) {
  const color = isNewest ? NEWEST_ORANGE : (SEVERITY_COLOR[event.severity] ?? SEVERITY_COLOR.low);
  return (
    <div
      className={`event-map-marker ${isNewest ? "newest" : ""}`}
      title={`${event.id} — ${event.location_name ?? ""}${isNewest ? " (newest)" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {isNewest && <div className="event-map-ring" style={{ borderColor: color }} />}
      <div
        className="event-map-dot"
        style={{
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
    </div>
  );
}
