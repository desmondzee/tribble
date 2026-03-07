"use client";

import type { HipEvent } from "@/types";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#38bdf8",
};

interface EventMarkerProps {
  event: HipEvent;
  onClick?: () => void;
}

export function EventMarker({ event, onClick }: EventMarkerProps) {
  const color = SEVERITY_COLOR[event.severity] ?? SEVERITY_COLOR.low;
  return (
    <div
      className="event-map-marker"
      title={`${event.id} — ${event.location_name}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
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
