"use client";

import type { Drone } from "@/types";

const STATUS_COLOR: Record<string, string> = {
  active: "#00ff99",
  standby: "#00aabf",
  low_battery: "#ff6a00",
  lost_signal: "#3a5a68",
};

interface DroneMarkerProps {
  drone: Drone;
}

export function DroneMarker({ drone }: DroneMarkerProps) {
  const color = STATUS_COLOR[drone.status] ?? "#3a5a68";
  const title = `${drone.id} // ${drone.status} // ${drone.battery_pct}%`;
  return (
    <div className="drone-map-marker" title={title}>
      <div className="drone-map-ring" style={{ borderColor: color }} />
      <div
        className="drone-map-dot"
        style={{
          background: color,
          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}40`,
        }}
      />
    </div>
  );
}
