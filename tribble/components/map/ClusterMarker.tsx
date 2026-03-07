"use client";

/** Color by weighted_severity: high (≥0.7) → red, medium (0.4–0.7) → orange, low (<0.4) → cyan */
const SEVERITY_COLOR: Record<string, string> = {
  high: "#ef4444",
  medium: "#ff6a00",
  low: "#38bdf8",
};

function getSeverityLevel(severity?: number): "high" | "medium" | "low" {
  if (severity == null) return "low";
  if (severity >= 0.7) return "high";
  if (severity >= 0.4) return "medium";
  return "low";
}

export interface ClusterMarkerProps {
  cluster: {
    id?: string;
    report_count?: number;
    weighted_severity?: number;
    top_need_categories?: string[];
  };
}

export default function ClusterMarker({ cluster }: ClusterMarkerProps) {
  const level = getSeverityLevel(cluster.weighted_severity);
  const color = SEVERITY_COLOR[level] ?? SEVERITY_COLOR.low;
  const categories = cluster.top_need_categories?.join(", ") ?? "";
  const title = `${cluster.id ?? "cluster"} // ${cluster.report_count ?? 0} reports // ${categories}`;

  return (
    <div
      className={`cluster-map-marker ${level}`}
      title={title}
    >
      <div className="cluster-map-ring" style={{ borderColor: color }} />
      <div
        className="cluster-map-dot"
        style={{
          background: color,
          boxShadow: `0 0 8px ${color}, 0 0 16px ${color}40`,
        }}
      />
    </div>
  );
}
