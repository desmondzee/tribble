export const CRISIS_CATEGORIES = [
  { key: "armed_conflict", label: "Armed Conflict" },
  { key: "displacement", label: "Displacement" },
  { key: "food_insecurity", label: "Food Insecurity" },
  { key: "water_crisis", label: "Water Crisis" },
  { key: "disease_outbreak", label: "Disease Outbreak" },
  { key: "infrastructure_damage", label: "Infrastructure Damage" },
  { key: "aid_obstruction", label: "Aid Obstruction" },
  { key: "protection_risk", label: "Protection Risk" },
] as const;

export const HELP_CATEGORIES = [
  { key: "food", label: "Food" },
  { key: "water", label: "Water" },
  { key: "health", label: "Health" },
  { key: "shelter", label: "Shelter" },
  { key: "security", label: "Security" },
  { key: "evacuation", label: "Evacuation" },
] as const;
