"use client";

import { motion } from "framer-motion";
import type { Incident } from "@/types";
import { SeverityBadge } from "@/components/shared/SeverityBadge";

const TYPE_LABELS: Record<string, string> = {
  armed_conflict: "Armed Conflict",
  displacement: "Displacement",
  displacement_mass: "Displacement",
  infrastructure_damage: "Infra. Damage",
  bridge_damaged: "Infra. Damage",
  aid_obstruction: "Aid Obstruction",
  natural_disaster: "Natural Disaster",
  disease_outbreak: "Disease Outbreak",
  food_distribution: "Food Distribution",
  suspicious_activity: "Suspicious Activity",
  water_contamination: "Water Contamination",
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${hour}:${min}`;
}

interface Props {
  incident: Incident;
  x: number;
  y: number;
}

export const IncidentTooltip = ({ incident, x, y }: Props) => (
  <motion.div
    className="fixed z-50 pointer-events-none"
    style={{ left: x + 16, top: y - 8 }}
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.1 }}
  >
    <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-sm p-2.5 min-w-[180px] max-w-[220px] shadow-lg">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono text-[10px] text-primary">{incident.id}</span>
        <SeverityBadge severity={incident.severity} />
      </div>
      <p className="font-mono text-[10px] text-foreground mb-0.5">
        {TYPE_LABELS[incident.type] ?? incident.type}
      </p>
      <p className="font-mono text-[9px] text-muted-foreground mb-1">
        {incident.location_name}
      </p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[8px] text-muted-foreground">
          {formatTimestamp(incident.timestamp)}
        </span>
        <span className="font-mono text-[9px] text-foreground">
          Risk {incident.risk_score}
        </span>
      </div>
    </div>
  </motion.div>
);
