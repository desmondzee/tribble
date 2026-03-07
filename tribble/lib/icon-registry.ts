import type { SourceType } from "@/types";

/**
 * Maps ontology class to the layer group C sub-layer it belongs to.
 */
export const ONTOLOGY_TO_LAYER: Record<string, string> = {
  armed_conflict: "C1",
  airstrike: "C1",
  shelling: "C1",
  bridge_damaged: "C2",
  displacement_mass: "C3",
  aid_obstruction: "C4",
  disease_outbreak: "C5",
  food_distribution: "C4",
  suspicious_activity: "C1",
  water_contamination: "C2",
};

export const SOURCE_ICONS: Record<
  SourceType,
  { icon: string; colour: string; label: string }
> = {
  news_agent: { icon: "📡", colour: "var(--hip-accent)", label: "News Agent" },
  user_submission: {
    icon: "👤",
    colour: "var(--hip-warn)",
    label: "User Submission",
  },
  satellite: { icon: "🛰", colour: "#9B59B6", label: "Satellite" },
  weather_api: { icon: "🌦", colour: "#3498DB", label: "Weather" },
  drone: { icon: "✈", colour: "var(--hip-green)", label: "Drone" },
  analyst_input: { icon: "🔬", colour: "#E74C3C", label: "Analyst" },
};
